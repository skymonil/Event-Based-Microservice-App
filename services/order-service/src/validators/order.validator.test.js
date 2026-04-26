const {
    createOrderSchema,
    orderIdParamSchema,
    cancelOrderSchema
} = require("./order.validator");

describe("Order Validator Unit Tests", () => {
    
    describe("createOrderSchema", () => {
        const validOrder = {
            items: [
                { productId: "550e8400-e29b-41d4-a716-446655440000", quantity: 2 },
                { productId: "550e8400-e29b-41d4-a716-446655440001", quantity: 1 }
            ],
            totalAmount: 250.50
        };

        it("should pass with valid order data", () => {
            const { error } = createOrderSchema.validate(validOrder);
            expect(error).toBeUndefined();
        });

        it("should fail if items array is empty", () => {
            const { error } = createOrderSchema.validate({ ...validOrder, items: [] });
            expect(error).toBeDefined();
            expect(error.details[0].message).toMatch(/must contain at least 1 items/);
        });

        it("should fail if productId is not a valid UUID", () => {
            const invalidOrder = {
                ...validOrder,
                items: [{ productId: "not-a-uuid", quantity: 1 }]
            };
            const { error } = createOrderSchema.validate(invalidOrder);
            expect(error).toBeDefined();
            expect(error.details[0].message).toMatch(/must be a valid GUID/);
        });

        it("should fail if quantity is less than 1", () => {
            const invalidOrder = {
                ...validOrder,
                items: [{ productId: "550e8400-e29b-41d4-a716-446655440000", quantity: 0 }]
            };
            const { error } = createOrderSchema.validate(invalidOrder);
            expect(error).toBeDefined();
            expect(error.details[0].message).toMatch(/must be greater than or equal to 1/);
        });

        it("should fail if totalAmount is zero or negative", () => {
            const { error } = createOrderSchema.validate({ ...validOrder, totalAmount: -10 });
            expect(error).toBeDefined();
            expect(error.details[0].message).toMatch(/must be a positive number/);
        });
    });

    describe("orderIdParamSchema", () => {
        it("should pass with a valid UUID param", () => {
            const { error } = orderIdParamSchema.validate({ id: "550e8400-e29b-41d4-a716-446655440000" });
            expect(error).toBeUndefined();
        });

        it("should fail with an invalid UUID param", () => {
            const { error } = orderIdParamSchema.validate({ id: "123-abc" });
            expect(error).toBeDefined();
        });
    });

    describe("cancelOrderSchema", () => {
        it("should pass if idempotency-key is a valid UUID", () => {
            const headers = { "idempotency-key": "550e8400-e29b-41d4-a716-446655440000" };
            const { error } = cancelOrderSchema.validate(headers);
            expect(error).toBeUndefined();
        });

        it("should allow other headers (unknown: true)", () => {
            const headers = { 
                "idempotency-key": "550e8400-e29b-41d4-a716-446655440000",
                "user-agent": "Mozilla/5.0",
                "host": "localhost"
            };
            const { error } = cancelOrderSchema.validate(headers);
            expect(error).toBeUndefined();
        });

        it("should fail if idempotency-key is missing", () => {
            const { error } = cancelOrderSchema.validate({ "content-type": "application/json" });
            expect(error).toBeDefined();
            expect(error.details[0].message).toMatch(/"idempotency-key" is required/);
        });
    });
});