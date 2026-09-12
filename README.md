# LPG ERP Backend

A focused Express/MongoDB API for cylinder-based LPG sales, FIFO KG inventory, historical batch costing, payments, expenses, and reporting.

Documentation:

- [Complete backend documentation](BACKEND_DOCUMENTATION.md)
- [Frontend development prompt](FRONTEND_DEVELOPMENT_PROMPT.md)

## Setup

1. Install Node.js 20+ and MongoDB 6+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set `MONGO_URI` and a strong `JWT_SECRET`.
4. Copy `.env.example` to `.env` and set `MONGO_URI`, keep `MONGO_DB=sovonlpg`, and set a strong `JWT_SECRET`.
5. Run `npm run seed` to create cylinder types, expense categories, and `admin@example.com` / `ChangeMe123!`.
6. Start with `npm start` or `npm run dev`.

The API is available at `http://localhost:4000/api`; use `POST /api/auth/login` for a bearer token. Completed purchases and sales use MongoDB transactions, so production MongoDB must run as a replica set (a single-node replica set is sufficient for local development).
The API is available at `http://localhost:4000/api`; use `POST /api/auth/login` for a bearer token. All application collections are created in the `sovonlpg` database. Completed purchases and sales use MongoDB transactions, so production MongoDB must run as a replica set (a single-node replica set is sufficient for local development).

## Rules encoded

Sales accept only cylinder type and count. LPG KG is calculated server-side. FIFO consumes purchase batches in batch-date order and persists each allocation, cost, COGS, revenue, and gross profit on the sale. Voiding a sale restores its exact allocated KG and preserves the original record.

All successful responses use `{ success, message, data }`; validation and operational errors use `{ success: false, message, errors?, data? }`. List responses include pagination metadata.

## Tests

Run `npm.cmd test` on PowerShell if the local execution policy blocks the `npm` shim.
