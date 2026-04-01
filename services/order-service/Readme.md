## 📦 Order Service

The **Order Service** is a core business microservice responsible for managing the order lifecycle in an event-driven microservices architecture. 

It persists orders in its own database and publishes domain events to **Kafka**, enabling downstream services (Payment, Inventory, Notification) to react asynchronously.

---

### 🎯 Responsibilities

| ✅ What Order Service DOES | ❌ What Order Service DOES NOT DO |
| :--- | :--- |
| Create customer orders | Process payments |
| Enforce ownership & authorization | Manage inventory |
| Persist order state (DB per service) | Send notifications |
| Publish `order.created` domain events | Perform synchronous inter-service calls |
| Ensure safe retries via idempotency | |
| Expose REST APIs for order retrieval | |

---

### 🧱 Architecture Overview

```text
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
```

> **Pattern used:** Event choreography (not orchestration)

---

### 🛠️ Tech Stack

* **Runtime:** Node.js (Express)
* **Database:** PostgreSQL
* **Messaging:** Apache Kafka (Client: `kafkajs`)
* **Validation:** Joi
* **Logging:** Pino
* **Auth:** JWT (Verification only)
* **Migrations:** dbmate
* **Error Standard:** RFC 7807 (Problem Details)

---

### 📁 Project Structure

```text
order-service/
├── src/
│   ├── app.js                 # Express app & middleware
│   ├── index.js               # Server entry + graceful shutdown
│   │
│   ├── config/                # Environment configuration
│   ├── controllers/           # HTTP adapters
│   ├── services/              # Business logic (domain layer)
│   ├── db/
│   │   ├── migrations/        # SQL migrations
│   │   ├── queries/           # Raw SQL queries
│   │   └── index.js           # DB pool
│   ├── kafka/
│   │   └── producer.js        # Kafka producer
│   ├── middleware/            # Auth, validation, error handling
│   ├── validators/            # Joi schemas
│   └── utils/                 # Logger, AppError
│
├── Dockerfile
├── .env.example
├── package.json
└── README.md
```

---

### 🔑 Authentication & Idempotency

#### **Authentication**
* Uses **JWT Bearer tokens**.
* The JWT is **validated**, not issued, by this service.
* User identity is extracted from the token (`req.user.userId`).
* All order access is strictly **ownership-restricted**.

#### **🔁 Idempotency**
Order creation supports safe retries using an `Idempotency-Key` header.
* **Why?** Protects against duplicate orders and handles network retries or double-submits.
* **How it works:** Client generates a UUID; the server stores it with the order. If the same key is sent again, the same order is returned.

---

### 📡 Kafka Integration

**Published Event Topic:** `order.created`

**Payload Example:**
```json
{
  "orderId": "uuid",
  "userId": "uuid",
  "totalAmount": 499,
  "createdAt": "2026-01-03T12:00:00Z",
  "requestId": "trace-id",
  "idempotencyKey": "uuid"
}
```

**Design Principles:**
1.  Order is persisted before event publication.
2.  Order Service does not know who consumes the event.
3.  Kafka decouples downstream services.

---

### 🧨 Error Handling (RFC 7807)

All errors follow the **RFC 7807 – Problem Details** standard for consistent, client-friendly error reporting across microservices.

**Example (403 Forbidden):**
```json
{
  "type": "https://order-service/problems/forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "You are not allowed to access this order",
  "instance": "/api/orders/abc"
}
```

---

### 🌐 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/api/orders` | Create Order (Requires `Authorization` & `Idempotency-Key`) |
| **GET** | `/api/orders/:id` | Get Order by ID (Returns 403 if ownership fails) |
| **GET** | `/api/orders` | Get all orders for the authenticated user |

---

### 🚀 Production Readiness

* ✔ **Database per service:** Complete data isolation.
* ✔ **Stateless API:** Scales horizontally with ease.
* ✔ **Graceful shutdown:** Cleans up DB pools and Kafka producers.
* ✔ **Structured logging:** Pino for high-performance JSON logs.
* ✔ **Idempotent writes:** Prevents data duplication on retries.

> **Design Philosophy:**
> *"Order Service is the source of truth for orders. It publishes facts, not commands. Other services react asynchronously."*