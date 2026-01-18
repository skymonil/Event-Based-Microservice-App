const inventoryQueries = require("../db/queries/inventory.queries");
const db = require("../db/index");
const { logger } = require("../utils/logger");
const metrics = require("../utils/metrics");

const cleanupExpiredReservations = async () => {
  const client = await db.connect();
  
  try {
    await client.query("BEGIN");

    // 1. Mark rows as EXPIRED and get the list
    const expired = await inventoryQueries.findAndExpireReservations(client);

    if (expired.length === 0) {
      await client.query("COMMIT");
      return;
    }

    logger.info({ count: expired.length }, "🧹 Found expired reservations, reclaiming stock...");

    for (const res of expired) {
      // 2. Increment stock back
      await inventoryQueries.incrementStock(
        { productId: res.product_id, warehouse_id: res.warehouse_id, quantity: res.quantity },
        client
      );

      // 3. Mark the Order level status as RELEASED/EXPIRED
      await inventoryQueries.updateOrderStatus(res.order_id, 'RELEASED', client);
      
      // 4. Record Metric for SRE visibility
      metrics.releaseCounter.inc({ trigger: 'expiry' });
    }

    await client.query("COMMIT");
    logger.info("✅ Expiry cleanup cycle completed successfully");

  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "❌ Failed to cleanup expired reservations");
  } finally {
    client.release();
  }
};

// Run every 60 seconds
setInterval(cleanupExpiredReservations, 60000);