// services/user-service/tests/integration/user.api.test.js

// 🟢 FIX: Mock uuid BEFORE anything else to avoid ESM error
jest.mock("uuid", () => ({
    v4: () => "550e8400-e29b-41d4-a716-446655440000" 
}));

const { PostgreSqlContainer } = require("@testcontainers/postgresql");
const { execSync } = require("child_process");
const request = require("supertest");
const path = require("path");

describe("User Service API Integration Tests", () => {
    let pgContainer;
    let app;
    let db;

    // 🟢 1. SETUP: Boot Docker and initialize the app
    beforeAll(async () => {
        console.log("🐳 Starting PostgreSQL Testcontainer...");
        
        pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
            .withDatabase("user_db_test")
            .withUsername("postgres")
            .withPassword("postgres")
            .start();

        const uri = pgContainer.getConnectionUri();
        const dbmateUri = `${uri}?sslmode=disable`;

        process.env.DB_URL = uri;
        process.env.DATABASE_URL = dbmateUri; 
        process.env.JWT_SECRET = "super-secret-test-key";
        process.env.NODE_ENV = "test";

        console.log(`✅ Container running at: ${uri}`);
        console.log("🛠️ Running database migrations...");
        
        try {
            const migrationsDir = path.join(__dirname, "../../src/db/migrations");
            execSync(`dbmate -d "${migrationsDir}" up`, { 
                env: process.env, 
                stdio: "inherit", 
                shell: true 
            });
        } catch (error) {
            console.error("❌ Migration failed!", error);
            throw error; 
        }

        app = require("../../src/app"); 
        db = require("../../src/db/index"); 

    }, 60000);

    // 🟢 2. CLEANUP: Wipe data between tests
    beforeEach(async () => {
        if (db) await db.query('TRUNCATE TABLE users CASCADE;');
    });

    // 🟢 3. TEARDOWN: Destroy the container
    afterAll(async () => {
        console.log("🛑 Stopping Testcontainer...");
        if (db && typeof db.close === 'function') {
            await db.close(); 
        }
        if (pgContainer) {
            await pgContainer.stop(); 
        }
    });

    // --- The Actual Tests ---

    describe("POST /api/users", () => {
        it("should create a user in the isolated Docker database and return 201", async () => {
            const payload = {
                name: "Testcontainers User",
                email: "docker-test@example.com",
                password: "SecurePassword123"
            };

            const res = await request(app).post("/api/users").send(payload);

            expect(res.status).toBe(201);
            expect(res.body.user.email).toBe("docker-test@example.com");
            expect(res.body.user.id).toBe("550e8400-e29b-41d4-a716-446655440000");

            const dbResult = await db.query('SELECT * FROM users WHERE email = $1', [payload.email]);
            expect(dbResult.rows.length).toBe(1);
            expect(dbResult.rows[0].name).toBe("Testcontainers User");
        });

        it("should return 409 Conflict if we try to register the same email twice", async () => {
            const payload = {
                name: "Duplicate User",
                email: "duplicate@example.com",
                password: "SecurePassword123"
            };

            await request(app).post("/api/users").send(payload);
            const res = await request(app).post("/api/users").send(payload);

            expect(res.status).toBe(409);
        });
    }); // 🟢 Fixed: Added missing closing bracket for POST describe block

    describe("GET /api/users/:id", () => {
        it("should return 200 and the user record if it exists", async () => {
            const testId = "550e8400-e29b-41d4-a716-446655440001"; 
            await db.query(
                "INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)",
                [testId, "Existing User", "existing@example.com", "hashed_password"]
            );

            const res = await request(app).get(`/api/users/${testId}`);

            expect(res.status).toBe(200);
            expect(res.body.name).toBe("Existing User");
            expect(res.body.email).toBe("existing@example.com");
            expect(res.body).not.toHaveProperty("password_hash");
        });

        it("should return 404 if the user does not exist", async () => {
            const fakeId = "550e8400-e29b-41d4-a716-446655440999";
            const res = await request(app).get(`/api/users/${fakeId}`);
            
            expect(res.status).toBe(404);
            const errorMessage = res.body.detail || res.body.message;
            expect(errorMessage).toMatch(/not found/i);
        });
    });
});