// A simple script to copy Postgres -> Redis
const db = require("../db/index");
const redis = require("../redis/client");

async function hydrate() {
    console.log("💧 Starting Hydration...");
    const { rows } = await db.query("SELECT * FROM products JOIN inventory_stock ON ...");
    
    for (const row of rows) {
        const key = `stock:product:${row.id}`;
        await redis.hmset(key, {
            total: row.total_quantity,
            available: row.available_quantity
        });
        console.log(`Hydrated ${row.id}`);
    }
    process.exit();
}

hydrate();