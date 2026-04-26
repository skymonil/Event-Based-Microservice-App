// src/controllers/order.controller.test.js
const orderController = require("./order.controller");
const orderService = require("../services/order.service");
const { logger } = require("@my-app/common");
jest.mock("uuid", () => ({
    v4: () => "550e8400-e29b-41d4-a716-446655440000" 
}));
// 🟢 1. Mock the dependencies
jest.mock("../services/order.service");
jest.mock("@my-app/common", () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

describe("Order Controller Unit Tests", () => {
    let req, res, next;

    // Reset mocks before each test
    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            body: {},
            params: {},
            headers: {},
            user: { userId: "550e8400-e29b-41d4-a716-446655440000" },
            requestId: "req-abc",
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        next = jest.fn();
    });

    describe("createOrder", () => {
        it("should return 201 for a fresh order creation", async () => {
            req.headers["idempotency-key"] = "idemp-123";
            req.body = { items: [{ id: "item-1" }], totalAmount: 100 };

            const mockOrder = { id: "order-1", isDuplicate: false };
            orderService.createOrder.mockResolvedValue(mockOrder);

            await orderController.createOrder(req, res, next);

            expect(orderService.createOrder).toHaveBeenCalledWith({
                userId: "550e8400-e29b-41d4-a716-446655440000",
                items: req.body.items,
                totalAmount: 100,
                idempotencyKey: "idemp-123",
                requestId: "req-abc",
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(mockOrder);
        });

        it("should return 200 for a duplicate idempotent request", async () => {
            req.headers["idempotency-key"] = "idemp-123";
            
            const mockDuplicateOrder = { id: "order-1", isDuplicate: true };
            orderService.createOrder.mockResolvedValue(mockDuplicateOrder);

            await orderController.createOrder(req, res, next);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockDuplicateOrder);
        });

        it("should call next(error) if service throws", async () => {
            const error = new Error("Database failure");
            orderService.createOrder.mockRejectedValue(error);

            await orderController.createOrder(req, res, next);

            expect(next).toHaveBeenCalledWith(error);
        });
    });

    describe("cancelOrder", () => {
        it("should return 400 if idempotency key is missing", async () => {
            req.params.id = "order-1";
            // Explicitly leaving req.headers["idempotency-key"] undefined

            await orderController.cancelOrder(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Idempotency key is required" });
            expect(orderService.cancelOrder).not.toHaveBeenCalled();
        });

        it("should return 202 on successful cancellation", async () => {
            req.params.id = "order-1";
            req.headers["idempotency-key"] = "cancel-key-123";

            const mockResult = { orderId: "order-1", status: "CANCELLED", duplicate: false };
            orderService.cancelOrder.mockResolvedValue(mockResult);

            await orderController.cancelOrder(req, res, next);

            expect(orderService.cancelOrder).toHaveBeenCalledWith({
                orderId: "order-1",
                userId: "550e8400-e29b-41d4-a716-446655440000",
                idempotencyKey: "cancel-key-123",
            });
            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.json).toHaveBeenCalledWith(mockResult);
            expect(next).toHaveBeenCalled(); // Because your controller calls next() after res.json()
        });
    });
});