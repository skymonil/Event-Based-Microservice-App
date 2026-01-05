📦 Order Service

Order Service is a core business microservice responsible for managing the order lifecycle in an event-driven microservices architecture.

It persists orders in its own database and publishes domain events to Kafka, enabling downstream services (Payment, Inventory, Notification) to react asynchronously.

🎯 Responsibilities
✅ What Order Service DOES

Create customer orders

Enforce ownership & authorization

Persist order state (DB per service)

Publish order.created domain events

Ensure safe retries via idempotency

Expose REST APIs for order retrieval

❌ What Order Service DOES NOT DO

Process payments

Manage inventory

Send notifications

Perform synchronous inter-service calls

🧱 Architecture Overview
Client
  ↓
API Gateway / Direct Call
  ↓
Order Service (REST)
  ↓
PostgreSQL (Orders DB)
  ↓
Kafka → order.created
            ↓
     Payment / Inventory / Notification


Pattern used: Event choreography (not orchestration)

🛠️ Tech Stack

Runtime: Node.js (Express)

Database: PostgreSQL

Messaging: Apache Kafka

Kafka Client: kafkajs

Validation: Joi

Logging: Pino

Auth: JWT (verification only)

Migrations: dbmate

Error Standard: RFC 7807 (Problem Details)

📁 Project Structure
order-service/
├── src/
│   ├── app.js                  # Express app & middleware
│   ├── index.js                # Server entry + graceful shutdown
│   │
│   ├── config/                 # Environment configuration
│   ├── controllers/            # HTTP adapters
│   ├── services/               # Business logic (domain layer)
│   ├── db/
│   │   ├── migrations/         # SQL migrations
│   │   ├── queries/            # Raw SQL queries
│   │   └── index.js            # DB pool
│   ├── kafka/
│   │   └── producer.js         # Kafka producer
│   ├── middleware/             # Auth, validation, error handling
│   ├── validators/             # Joi schemas
│   └── utils/                  # Logger, AppError
│
├── Dockerfile
├── .env.example
├── package.json
└── README.md

🔑 Authentication

Uses JWT Bearer tokens

JWT is validated, not issued, by this service

User identity is extracted from token (req.user.userId)

All order access is ownership-restricted

🔁 Idempotency

Order creation supports safe retries using an Idempotency-Key header.

Why?

Protects against duplicate orders

Handles network retries & double submits

How it works

Client generates UUID

Server stores it with the order

Same key → same order returned

Example
POST /api/orders
Idempotency-Key: 123e4567-e89b-12d3-a456-426614174000

📡 Kafka Integration
Published Event

Topic: order.created

{
  "orderId": "uuid",
  "userId": "uuid",
  "totalAmount": 499,
  "createdAt": "2026-01-03T12:00:00Z",
  "requestId": "trace-id",
  "idempotencyKey": "uuid"
}

Design Principles

Order is persisted before event publication

Order Service does not know who consumes the event

Kafka decouples downstream services

🧨 Error Handling (RFC 7807)

All errors follow RFC 7807 – Problem Details.

Example (403 Forbidden)
{
  "type": "https://order-service/problems/forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "You are not allowed to access this order",
  "instance": "/api/orders/abc"
}

Benefits

Consistent error format

Client-friendly

Works across microservices

No error leakage

🌐 API Endpoints
Create Order
POST /api/orders


Headers

Authorization: Bearer <JWT>

Idempotency-Key: <UUID>

Body

{
  "items": [
    { "productId": "uuid", "quantity": 2 }
  ],
  "totalAmount": 499
}

Get Order by ID
GET /api/orders/:id


Returns 403 if order does not belong to the user.

Get Orders for User
GET /api/orders

🧪 Local Development
1️⃣ Install dependencies
npm install

2️⃣ Set environment variables
cp .env.example .env

3️⃣ Run DB migrations
dbmate up

4️⃣ Start service
npm run dev

⚙️ Environment Variables
PORT=3001
DB_URL=postgres://postgres:admin@localhost:5432/orders
JWT_SECRET=your-secret
KAFKA_BROKERS=localhost:9092
LOG_LEVEL=debug

🚀 Production Readiness

✔ Database per service
✔ Stateless API
✔ Graceful shutdown
✔ Structured logging
✔ Event-driven integration
✔ Idempotent writes
✔ RFC 7807 error standard

🏆 Design Philosophy

“Order Service is the source of truth for orders.
It publishes facts, not commands.
Other services react asynchronously.”