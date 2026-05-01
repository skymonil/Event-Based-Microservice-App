// tests/user-service/user.smoke.test.js
import { v4 as uuidv4 } from "uuid";
import { createClient } from "../common/httpClient.js"; // Note the .js extension
import { waitFor } from "../common/waitFor.js";

const client = createClient(process.env.TARGET_URL); 

describe("User Service - Core Journey Smoke Test", () => {
    const uniqueEmail = `smoke-test-${Date.now()}-${uuidv4()}@example.com`;
    const password = "StrongPassword123!";
    let userId;
    let authToken;

    beforeAll(async () => {
        console.log("⏳ Waiting for User Service to become healthy...");
        await waitFor(
            async () => {
                try {
                    const res = await client.get("/health");
                    return res.status === 200;
                } catch (e) {
                    console.log(`[Health Check] Waiting... Error: ${e.message}`);
                    return false;
                }
            },
            60000,
            "User service not ready for Smoke Test"
        );
        console.log("✅ User Service is up!");
    }, 60000);

   

    it("1. should register a new user successfully (201)", async () => {
        const res = await client.post("/api/users", {
            email: uniqueEmail,
            password: password,
            name: "Smoke Tester",
        });

        expect(res.status).toBe(201);
        expect(res.data.user.email).toBe(uniqueEmail);
        userId = res.data.user.id; // Capture ID for later steps
    });

    it("2. should login and return a JWT token (200)", async () => {
        const res = await client.post("/api/users/login", { 
            email: uniqueEmail, 
            password: password 
        });
        
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty("token");
        authToken = res.data.token; // Capture token for profile & cleanup
    });

    it("3. should allow access to protected user profile (200)", async () => {
        const res = await client.get(`/api/users/${userId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });

        expect(res.status).toBe(200);
        expect(res.data.id).toBe(userId);
    });
});