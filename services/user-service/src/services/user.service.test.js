// src/services/user.service.test.js
const userService = require("./user.service");
const userQueries = require("../db/queries/user.queries");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
// 🟢 Add this mock to intercept the ESM library before Jest parses it!
jest.mock("uuid", () => ({
    v4: jest.fn(() => "mocked-uuid-1234")
}));
// 🟢 MOCK EXTERNAL DEPENDENCIES
jest.mock("../db/queries/user.queries");
jest.mock("bcrypt");
jest.mock("jsonwebtoken");

// Mock metrics to prevent prom-client from crashing
jest.mock("../metrics", () => ({
    businessErrorsTotal: { labels: jest.fn().mockReturnThis(), inc: jest.fn() },
    usersCreatedTotal: { inc: jest.fn() },
    loginAttempts: { labels: jest.fn().mockReturnThis(), inc: jest.fn() }
}));

describe("User Service Unit Tests", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("createUser", () => {
        it("should successfully create a user and NOT return the password hash", async () => {
            // Arrange
            userQueries.getUserByEmail.mockResolvedValue(null);
            bcrypt.hash.mockResolvedValue("fake_hash");
            userQueries.createUser.mockResolvedValue(true);

            // Act
            const result = await userService.createUser({
                name: "Test User", email: "test@example.com", password: "Password123"
            });

            // Assert
            expect(result.email).toBe("test@example.com");
            expect(result).not.toHaveProperty("password_hash");
            expect(userQueries.createUser).toHaveBeenCalledTimes(1);
        });

        it("should throw a 409 if user already exists", async () => {
            userQueries.getUserByEmail.mockResolvedValue({ id: "123", email: "test@example.com" });

            await expect(userService.createUser({
                name: "Test User", email: "test@example.com", password: "Password123"
            })).rejects.toMatchObject({ status: 409 });

            expect(userQueries.createUser).not.toHaveBeenCalled();
        });
    });

    describe("loginUser", () => {
        it("should return a JWT token for valid credentials", async () => {
            // Arrange
            userQueries.getUserByEmail.mockResolvedValue({ id: "123", password_hash: "fake_hash" });
            bcrypt.compare.mockResolvedValue(true); // Password matches!
            jwt.sign.mockReturnValue("fake.jwt.token");

            // Act
            const token = await userService.loginUser("test@example.com", "Password123");

            // Assert
            expect(token).toBe("fake.jwt.token");
            expect(jwt.sign).toHaveBeenCalled();
        });

        it("should throw a 401 for invalid password", async () => {
            userQueries.getUserByEmail.mockResolvedValue({ id: "123", password_hash: "fake_hash" });
            bcrypt.compare.mockResolvedValue(false); // Password does NOT match!

            await expect(userService.loginUser("test@example.com", "WrongPass"))
                .rejects.toMatchObject({ status: 401 });
        });
    });
});