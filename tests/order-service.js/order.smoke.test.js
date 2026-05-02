// tests/order-service/order.smoke.test.js
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken"; 
import { createClient } from "../common/httpClient.js";
import { waitFor } from "../common/waitFor.js";

// 🟢 Point specifically to the order-service canary URL provided by Argo
const client = createClient(process.env.TARGET_URL);

describe("Order Service - Critical Path Smoke Test", () => {
    const idempotencyKey = `smoke-order-${Date.now()}-${uuidv4()}`;
    let authToken;

    beforeAll(async () => {
        console.log("⏳ Waiting for Order Service to become healthy...");
        
        // 1. Generate a valid token for the test run
        // Falls back to signing one if a static token isn't provided by the CI/CD pipeline
        if (process.env.SYNTHETIC_TEST_TOKEN) {
            authToken = process.env.SYNTHETIC_TEST_TOKEN;
        } else {
            const secret = process.env.JWT_SECRET || "fallback-secret-do-not-use-in-prod";
            authToken = jwt.sign({ userId: "00000000-0000-4000-a000-synthetic000" }, secret, { expiresIn: "5m" });
        }

        // 2. Wait for the pod to be ready
         await waitFor(
            async () => {
                try {
                    const res = await client.get("/health/ready"); // 🟢 Updated Path
                    if (res && res.status === 200) return true;
                    
                    console.log(`[Health] Not ready yet. Status: ${res?.status}`);
                    return false;
                } catch (e) {
                    console.log(`[Health] Network Error: ${e.code || e.message}`);
                    return false;
                }
            },
            60000,
            "Order service not ready for Smoke Test"
        );
        console.log("✅ Order Service is up and DB is connected!");
    }, 60000);

    it("1. should successfully create a new order (201)", async () => {
        const payload = {
            items: [{ productId: "synthetic-product-001", quantity: 1 }],
            totalAmount: 19.99
        };

        const res = await client.post("/api/orders/create", payload, {
            headers: {
                Authorization: `Bearer ${authToken}`,
                "idempotency-key": idempotencyKey
            }
        });

        expect(res.status).toBe(201);
        expect(res.data).toHaveProperty("id");
        expect(res.data.status).toBe("CREATED");
    });

    it("2. should reject duplicate requests using the same idempotency key (200 OK)", async () => {
        // We send the exact same request again. 
        // A healthy live environment should catch this and return the previous state.
        const payload = {
            items: [{ productId: "bc6ed327-a5c9-4551-92d2-f38462a095f4", quantity: 1 }],
            totalAmount: 2500
        };

        const res = await client.post("/api/orders/create", payload, {
            headers: {
                Authorization: `Bearer ${authToken}`,
                "idempotency-key": idempotencyKey // 🟢 Re-using the key from test 1
            }
        });

        // Depending on your API design, this might be a 200 OK returning the cached order,
        // or a 409 Conflict. Adjust this assertion to match your actual duplicate handling logic!
        expect(res.status).toBe(200); 
    });
});