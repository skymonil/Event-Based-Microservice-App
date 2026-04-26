// services/order-service/tests/integration/order.consumer.test.js

// 🟢 1. Standard Boilerplate Mocks
jest.mock("@my-app/common", () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    AppError: class AppError extends Error {
        constructor(opts) {
            super(opts.detail);
            this.status = opts.status;
            this.detail = opts.detail;
        }
    }
}));

jest.mock("@opentelemetry/api", () => {
    const mockSpan = { setAttribute: jest.fn(), setStatus: jest.fn(), recordException: jest.fn(), end: jest.fn() };
    return {
        trace: { getTracer: () => ({ startActiveSpan: jest.fn((name, callback) => callback(mockSpan)) }) },
        SpanStatusCode: { OK: 1, ERROR: 2 },
    };
});

jest.mock("../../src/metrics", () => ({
    ordersTotal: { inc: jest.fn() },
    orderValue: { observe: jest.fn() },
}));

// We don't want the service trying to talk to a real Kafka broker
jest.mock("../../src/kafka/producer", () => ({
    prepareOrderCreatedEvent: jest.fn(),
}));

const { PostgreSqlContainer } = require("@testcontainers/postgresql");
const { execSync } = require("child_process");
const path = require("path");

// 🟢 Require the service and db AFTER mocks
const orderService = require("../../src/services/order.service");
const db = require("../../src/db/index");

describe("Order Service - Kafka Consumer Integration Tests", () => {
    let pgContainer;

    beforeAll(async () => {
        console.log("🐳 Starting PostgreSQL Testcontainer for Consumers...");
        pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
            .withDatabase("order_db_consumer_test")
            .withUsername("postgres")
            .withPassword("postgres")
            .start();

        const uri = pgContainer.getConnectionUri();
        process.env.DB_URL = uri;
        process.env.DATABASE_URL = `${uri}?sslmode=disable`;

        console.log("🛠️ Running Dbmate migrations...");
        execSync(`pnpm exec dbmate -d "${path.join(__dirname, "../../src/db/migrations")}" up`, {
            env: process.env,
            stdio: "ignore", // Keep terminal clean
            shell: true,
        });
    }, 60000);

    beforeEach(async () => {
        // Wipe tables before each test
        await db.query('TRUNCATE TABLE orders CASCADE;');
        await db.query('TRUNCATE TABLE processed_events CASCADE;');
    });

    afterAll(async () => {
        console.log("🛑 Stopping Testcontainer...");
        if (db && typeof db.close === 'function') await db.close();
        if (pgContainer) await pgContainer.stop();
    });

    // --- Helper to Seed an Order ---
    const seedOrder = async (orderId, status = "CREATED") => {
        await db.query(
            `INSERT INTO orders (id, user_id, items, total_amount, status, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [orderId, "user-123", JSON.stringify([{ id: "item-1" }]), 100.00, status, "seed-key"]
        );
    };

    describe("handlePaymentCompleted (Kafka Topic: payment.successful)", () => {
        it("should update order status to PAID and record the event ID", async () => {
            const orderId = "11111111-e29b-41d4-a716-446655440000";
            const eventId = "evt-pay-001";
            
            // 1. Setup: Seed a CREATED order
            await seedOrder(orderId, "CREATED");

            // 2. Act: Simulate Kafka triggering the handler
            await orderService.handlePaymentCompleted(orderId, "pay-123", eventId);

            // 3. Assert Database State
            const orderResult = await db.query('SELECT status FROM orders WHERE id = $1', [orderId]);
            expect(orderResult.rows[0].status).toBe("PAID");

            const eventResult = await db.query('SELECT * FROM processed_events WHERE event_id = $1', [eventId]);
            expect(eventResult.rows.length).toBe(1);
        });

        it("should safely ignore duplicate Kafka messages (Idempotent Consumer)", async () => {
            const orderId = "22222222-e29b-41d4-a716-446655440000";
            const eventId = "evt-pay-duplicate-001";
            
            await seedOrder(orderId, "CREATED");

            // 1. Simulate the first message arriving
            await orderService.handlePaymentCompleted(orderId, "pay-123", eventId);
            
            // 2. Simulate Kafka delivering the EXACT SAME message again
            // If idempotency fails, this will throw a Unique Constraint error and crash
            await orderService.handlePaymentCompleted(orderId, "pay-123", eventId);

            // 3. Assert: Order is PAID, but we only have ONE record in processed_events
            const orderResult = await db.query('SELECT status FROM orders WHERE id = $1', [orderId]);
            expect(orderResult.rows[0].status).toBe("PAID");

            const eventResult = await db.query('SELECT * FROM processed_events WHERE event_id = $1', [eventId]);
            expect(eventResult.rows.length).toBe(1); // Crucial assertion!
        });
    });

    describe("handlePaymentFailed (Kafka Topic: payment.failed)", () => {
        it("should update order status to PAYMENT_FAILED", async () => {
            const orderId = "33333333-e29b-41d4-a716-446655440000";
            await seedOrder(orderId, "CREATED");

            // Act
            await orderService.handlePaymentFailed(orderId, "pay-999", "Insufficient Funds");

            // Assert
            const orderResult = await db.query('SELECT status FROM orders WHERE id = $1', [orderId]);
            expect(orderResult.rows[0].status).toBe("PAYMENT_FAILED");
        });
    });
});