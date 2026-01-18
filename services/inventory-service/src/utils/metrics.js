const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, RAM, Event Loop lag)
client.collectDefaultMetrics({ register });

// --- Custom Inventory Metrics ---

const reservationCounter = new client.Counter({
  name: 'inventory_reservation_total',
  help: 'Total number of stock reservations',
  labelNames: ['status', 'reason'], // status: success/failed, reason: oos/error
});

const releaseCounter = new client.Counter({
  name: 'inventory_release_total',
  help: 'Total number of stock releases (compensations)',
  labelNames: ['trigger'], // trigger: payment_failed/user_cancelled
});

const activeReservationsGauge = new client.Gauge({
  name: 'inventory_active_reservations_count',
  help: 'Number of currently active/unexpired reservations',
});

// Register custom metrics
register.registerMetric(reservationCounter);
register.registerMetric(releaseCounter);
register.registerMetric(activeReservationsGauge);

module.exports = {
  register,
  reservationCounter,
  releaseCounter,
  activeReservationsGauge
};