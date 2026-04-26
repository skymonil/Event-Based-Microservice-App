// src/services/order.service.test.js
const orderService = require("./order.service");
const orderQueries = require("../db/queries/order.queries");
const db = require("../db");
const metrics = require("../metrics");

// 🟢 1. Mock UUID
jest.mock("uuid", () => ({
    v4: () => "550e8400-e29b-41d4-a716-446655440000" 
}));

jest.mock("@my-app/common", () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
    // Manually mock AppError if your service uses it
    AppError: class AppError extends Error {
        constructor(opts) {
            super(opts.detail);
            this.status = opts.status;
            this.detail = opts.detail;
        }
    }
}));


// 🟢 2. Mock OpenTelemetry (OTEL)
jest.mock("@opentelemetry/api", () => {
    const mockSpan = {
        setAttribute: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn(),
    };
    return {
        trace: {
            getTracer: () => ({
                // Automatically execute the callback with our mock span
                startActiveSpan: jest.fn((name, callback) => callback(mockSpan)),
            }),
        },
        SpanStatusCode: { OK: 1, ERROR: 2 },
    };
});

// 🟢 3. Mock Prometheus Metrics
jest.mock("../metrics", () => ({
    ordersTotal: { inc: jest.fn() },
    orderValue: { observe: jest.fn() },
}));

// 🟢 4. Mock the Database Client & Transactions
const mockDbClient = {
    query: jest.fn(),
    release: jest.fn(),
};
jest.mock("../db", () => ({
    connect: jest.fn(() => mockDbClient),
    query: jest.fn(),
}));

// 🟢 5. Mock the Queries
jest.mock("../db/queries/order.queries");
jest.mock("../kafka/producer", () => ({
    prepareOrderCreatedEvent: jest.fn(() => ({ event: "mocked" })),
}));

describe("Order Service Unit Tests", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("createOrder", () => {
        const validPayload = {
            userId: "user-1",
            items: [{ productId: "prod-1", quantity: 2 }],
            totalAmount: 100,
            idempotencyKey: null, // Skipping idempotency for this test
            requestId: "req-abc",
        };

        it("should successfully execute a transaction and create an outbox entry", async () => {
            // Setup successful mock responses
            orderQueries.getOrderByIdempotencyKey.mockResolvedValue(null);
            orderQueries.createOrder.mockResolvedValue();
            orderQueries.createOutboxEntry.mockResolvedValue();

            // Act
            const result = await orderService.createOrder(validPayload);

            // Assert DB Client Connection
            expect(db.connect).toHaveBeenCalledTimes(1);

            // Assert Transaction Flow (BEGIN -> COMMIT)
            expect(mockDbClient.query).toHaveBeenNthCalledWith(1, "BEGIN");
            expect(orderQueries.createOrder).toHaveBeenCalledWith(
                expect.objectContaining({ id: "order-123", totalAmount: 100 }),
                mockDbClient // Ensures the transaction client was passed
            );
            expect(orderQueries.createOutboxEntry).toHaveBeenCalledWith(
                expect.objectContaining({ event: "mocked" }),
                mockDbClient
            );
            expect(mockDbClient.query).toHaveBeenNthCalledWith(2, "COMMIT");

            // Assert Cleanup
            expect(mockDbClient.release).toHaveBeenCalledTimes(1);

            // Assert Metrics
            expect(metrics.ordersTotal.inc).toHaveBeenCalledWith({ status: "CREATED" });
            expect(metrics.orderValue.observe).toHaveBeenCalledWith(100);

            // Assert Return Value
            expect(result.id).toBe("order-123");
            expect(result.isDuplicate).toBe(false);
        });

        it("should ROLLBACK the transaction if any query fails", async () => {
            // Setup a failure in the middle of the transaction
            orderQueries.createOrder.mockResolvedValue();
            orderQueries.createOutboxEntry.mockRejectedValue(new Error("DB Crash"));

            // Act & Assert
            await expect(orderService.createOrder(validPayload)).rejects.toThrow("DB Crash");

            // Assert Transaction Flow (BEGIN -> ROLLBACK)
            expect(mockDbClient.query).toHaveBeenNthCalledWith(1, "BEGIN");
            expect(mockDbClient.query).toHaveBeenNthCalledWith(2, "ROLLBACK");

            // Assert we did NOT record a successful metric
            expect(metrics.ordersTotal.inc).not.toHaveBeenCalled();

            // Assert Cleanup still happened
            expect(mockDbClient.release).toHaveBeenCalledTimes(1);
        });
    });
});