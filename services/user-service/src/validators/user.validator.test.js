// src/validators/user.validator.test.js
const { 
    createUserSchema, 
    loginSchema, 
    userIdParamSchema 
} = require("./user.validator");

describe("User Validator Unit Tests", () => {
    
    describe("createUserSchema", () => {
        it("should validate a correct payload", () => {
            const validPayload = {
                name: "John Doe",
                email: "john@example.com",
                password: "StrongPassword123"
            };
            const { error } = createUserSchema.validate(validPayload);
            expect(error).toBeUndefined(); // No error means it passed!
        });

        it("should fail if the email format is invalid", () => {
            const invalidPayload = {
                name: "John Doe",
                email: "not-an-email", 
                password: "StrongPassword123"
            };
            const { error } = createUserSchema.validate(invalidPayload);
            expect(error).toBeDefined();
            expect(error.message).toContain('"email" must be a valid email');
        });

        it("should fail if the password is too short", () => {
            const invalidPayload = {
                name: "John Doe",
                email: "john@example.com",
                password: "123" // Min length is 6
            };
            const { error } = createUserSchema.validate(invalidPayload);
            expect(error).toBeDefined();
            expect(error.message).toContain('"password" length must be at least 6 characters long');
        });
    });

    describe("loginSchema", () => {
        it("should validate correct login credentials", () => {
            const { error } = loginSchema.validate({
                email: "john@example.com",
                password: "StrongPassword123"
            });
            expect(error).toBeUndefined();
        });

        it("should fail if missing required fields", () => {
            const { error } = loginSchema.validate({
                email: "john@example.com"
                // Missing password
            });
            expect(error).toBeDefined();
            expect(error.message).toContain('"password" is required');
        });
    });

    describe("userIdParamSchema", () => {
        it("should validate a correct UUID", () => {
            const { error } = userIdParamSchema.validate({
                id: "123e4567-e89b-12d3-a456-426614174000" // Standard UUID
            });
            expect(error).toBeUndefined();
        });

        it("should fail if ID is not a valid UUID", () => {
            const { error } = userIdParamSchema.validate({
                id: "just-a-regular-string-123"
            });
            expect(error).toBeDefined();
            expect(error.message).toContain('"id" must be a valid GUID');
        });
    });
});