// services/order-service/tests/integration/order.api.test.js

// 🟢 1. Bypass OpenTelemetry SDK Boot (Prevents Jest Crash)
jest.mock("@my-app/common", () => {
    return {
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
        authMiddleware: (req, res, next) => {
            // 🟢 FIX 1: Use a valid UUID for the database
            req.user = { userId: "11111111-e29b-41d4-a716-446655440000" };
            next();
        },
        errorMiddleware: (err, req, res, next) => {
            // 🟢 FIX 2: Print the actual crash so we can see it in the terminal!
            console.error("🔥 API CRASHED:", err.stack || err.message || err); 
            res.status(err.status || 500).json({ error: err.detail || err.message });
        },
        prometheusMiddleware: () => (req, res, next) => next(),
        AppError: class AppError extends Error {
            constructor(opts) {
                super(opts.detail);
                this.status = opts.status;
                this.detail = opts.detail;
            }
        }
    };
});
jest.mock("uuid", () => ({
    v4: () => "550e8400-e29b-41d4-a716-446655440000" 
}));
jest.mock("../../src/kafka/producer", () => ({
    prepareOrderCreatedEvent: jest.fn((data) => ({
        aggregate_type: "ORDER",
        aggregate_id: data.orderId,
        event_type: "order.created",
        payload: { totalAmount: data.totalAmount }, // Mocked payload for the test
        metadata: {},
        traceparent: "dummy-trace",
        tracestate: "dummy-state"
    }))
}));
// Mock the OTEL API so the service wrapper doesn't fail
jest.mock("@opentelemetry/api", () => {
    const mockSpan = { setAttribute: jest.fn(), setStatus: jest.fn(), recordException: jest.fn(), end: jest.fn() };
    return {
        trace: { getTracer: () => ({ startActiveSpan: jest.fn((name, callback) => callback(mockSpan)) }) },
        SpanStatusCode: { OK: 1, ERROR: 2 },
    };
});

// Mock Prometheus metrics to prevent port binding conflicts
jest.mock("../../src/metrics", () => ({
    ordersTotal: { inc: jest.fn() },
    orderValue: { observe: jest.fn() },
    register: { metrics: jest.fn(), contentType: "text/plain" }
}));

const { PostgreSqlContainer } = require("@testcontainers/postgresql");
const { execSync } = require("child_process");
const request = require("supertest");
const path = require("path");

describe("Order Service API Integration Tests", () => {
    let pgContainer;
    let app;
    let db;

    // 🟢 2. SETUP: Boot Testcontainers and Dbmate
    beforeAll(async () => {
        console.log("🐳 Starting PostgreSQL Testcontainer for Orders...");
        
        pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
            .withDatabase("order_db_test")
            .withUsername("postgres")
            .withPassword("postgres")
            .start();

        const uri = pgContainer.getConnectionUri();

        // Map environment variables for the app and dbmate
        process.env.DB_URL = uri;
        process.env.DATABASE_URL = `${uri}?sslmode=disable`; 
        process.env.JWT_SECRET = "super-secret-test-key";
        process.env.NODE_ENV = "test";

        console.log("🛠️ Running database migrations...");
        try {
            const migrationsDir = path.join(__dirname, "../../src/db/migrations");
            execSync(`pnpm exec dbmate -d "${migrationsDir}" up`, { 
                env: process.env, 
                stdio: "inherit", 
                shell: true 
            });
        } catch (error) {
            console.error("❌ Migration failed!");
            throw error;
        }

        // Require app and db AFTER setting env vars
        app = require("../../src/app"); 
        db = require("../../src/db/index"); 

    }, 60000);

    // 🟢 3. CLEANUP: Wipe tables between tests
    beforeEach(async () => {
        if (db) {
            // Wipe both tables to maintain a clean room
            await db.query('TRUNCATE TABLE orders CASCADE;');
            await db.query('TRUNCATE TABLE outbox CASCADE;');
        }
    });

    afterAll(async () => {
        console.log("🛑 Stopping Testcontainer...");
        if (db && typeof db.close === 'function') await db.close(); 
        if (pgContainer) await pgContainer.stop();
    });

    // --- Helper for Mock Authentication ---
    // Since we mapped authMiddleware, we need a valid JWT to access the routes
    const jwt = require("jsonwebtoken");
    const getAuthToken = (userId = "test-user-123") => {
        return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
    };

    // --- The Tests ---

    describe("POST /api/orders/create", () => {
        it("should commit the order AND outbox event to the database (Transactional Outbox)", async () => {
            const token = getAuthToken("user-1");
            const payload = {
                items: [{ productId: "550e8400-e29b-41d4-a716-446655440000", quantity: 2 }],
                totalAmount: 150.50
            };

            // 1. Act: Hit the endpoint
            const res = await request(app)
                .post("/api/orders/create")
                .set("Authorization", `Bearer ${token}`)
                .set("idempotency-key", "idemp-key-001") // Custom header
                .send(payload);

            // 2. Assert API Response
            expect(res.status).toBe(201);
            expect(res.body.totalAmount).toBe(150.50);
            expect(res.body.status).toBe("CREATED");

            const orderId = res.body.id;

            // 3. Assert Database State: The Order
            const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
            expect(orderResult.rows.length).toBe(1);
            expect(orderResult.rows[0].status).toBe("CREATED");
            expect(orderResult.rows[0].idempotency_key).toBe("idemp-key-001");

            // 4. Assert Database State: The Outbox Event
            const outboxResult = await db.query('SELECT * FROM outbox WHERE aggregate_id = $1', [orderId]);
            expect(outboxResult.rows.length).toBe(1);
            expect(outboxResult.rows[0].aggregate_type).toBe("ORDER");
            expect(outboxResult.rows[0].event_type).toBe("order.created");
            
            // Verify the payload inside the outbox JSONB column
            expect(outboxResult.rows[0].payload.totalAmount).toBe(150.50);
        });

        it("should return 200 and ignore duplicate requests (Idempotency)", async () => {
            const token = getAuthToken("user-1");
            const payload = { items: [{ productId: "550e8400-e29b-41d4-a716-446655440000", quantity: 1 }], totalAmount: 50 };

            // Request 1: Fresh Creation
            const res1 = await request(app)
                .post("/api/orders/create")
                .set("Authorization", `Bearer ${token}`)
                .set("idempotency-key", "idemp-duplicate-test")
                .send(payload);
            
            expect(res1.status).toBe(201);

            // Request 2: Duplicate Attempt with same Idempotency Key
            const res2 = await request(app)
                .post("/api/orders/create")
                .set("Authorization", `Bearer ${token}`)
                .set("idempotency-key", "idemp-duplicate-test")
                .send(payload);

            // Assert it returned 200 OK (not 201 Created)
            expect(res2.status).toBe(200);
            expect(res2.body.isDuplicate).toBe(true);

            // Assert we didn't accidentally save two orders to the DB
            const dbCheck = await db.query('SELECT * FROM orders WHERE idempotency_key = $1', ["idemp-duplicate-test"]);
            expect(dbCheck.rows.length).toBe(1); // Still only 1 row!
        });
    });
});