// src/controllers/user.controller.test.js
const request = require("supertest");
const express = require("express");
const userController = require("./user.controller");
const userService = require("../services/user.service");
// 🟢 Add this mock to intercept the ESM library before Jest parses it!
jest.mock("uuid", () => ({
    v4: jest.fn(() => "mocked-uuid-1234")
}));
// 🟢 MOCK THE ENTIRE SERVICE LAYER
jest.mock("../services/user.service");

// We create a tiny, fake Express app just for testing the controller
const app = express();
app.use(express.json());

// Mock logger to keep test output clean
jest.mock("@my-app/common", () => ({
    logger: { info: jest.fn(), error: jest.fn() }
}));

// Setup routes for the test
app.post("/api/users", userController.createUser);
app.post("/api/users/login", userController.loginUser);

// Basic error handler for the test to catch next(err)
app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ detail: err.detail });
});

describe("User Controller Unit Tests", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("POST /api/users", () => {
        it("should return 201 when service successfully creates a user", async () => {
            // Tell our fake service to return a successful user object
            userService.createUser.mockResolvedValue({
                id: "123",
                name: "Test User",
                email: "test@example.com"
            });

            const res = await request(app)
                .post("/api/users")
                .send({ name: "Test User", email: "test@example.com", password: "Password123" });

            expect(res.status).toBe(201);
            expect(res.body.message).toBe("User created successfully");
            expect(res.body.user.id).toBe("123");
            expect(userService.createUser).toHaveBeenCalledTimes(1);
        });

        it("should call next(error) if service throws an error", async () => {
            // Tell our fake service to throw an error
            const fakeError = { status: 409, detail: "User already exists" };
            userService.createUser.mockRejectedValue(fakeError);

            const res = await request(app)
                .post("/api/users")
                .send({ name: "Test User", email: "test@example.com", password: "Password123" });

            expect(res.status).toBe(409);
            expect(res.body.detail).toBe("User already exists");
        });
    });

    describe("POST /api/users/login", () => {
        it("should return 200 and a token on successful login", async () => {
            userService.loginUser.mockResolvedValue("mocked.jwt.token");

            const res = await request(app)
                .post("/api/users/login")
                .send({ email: "test@example.com", password: "Password123" });

            expect(res.status).toBe(200);
            expect(res.body.token).toBe("mocked.jwt.token");
        });
    });
});