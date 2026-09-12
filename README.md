# LPG ERP Backend

A focused Express/MongoDB API for cylinder-based LPG sales, FIFO KG inventory, historical batch costing, payments, expenses, and reporting.

Documentation:

- [Complete backend documentation](BACKEND_DOCUMENTATION.md)
- [Frontend development prompt](FRONTEND_DEVELOPMENT_PROMPT.md)

## Setup

1. Install Node.js 20+ and MongoDB 6+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set `MONGO_URI` and a strong `JWT_SECRET`.
4. Keep `MONGO_DB=sovonlpg` and set `CLIENT_ORIGIN` to your local frontend plus any Vercel preview domains, for example `http://localhost:5173,https://*.vercel.app`.
5. Run `npm run seed` to create cylinder types, expense categories, and `admin@example.com` / `ChangeMe123!`.
6. Start with `npm start` or `npm run dev`.

## Vercel deployment

This project is configured for Vercel by using a single serverless entrypoint in `api/index.js` and a `vercel.json` rewrite map.

- Set `PORT` only for local development; Vercel injects its own runtime port.
- Add your production MongoDB URI to `MONGO_URI` in the Vercel project environment variables.
- `CLIENT_ORIGIN` should include your frontend domain and the wildcard preview pattern `https://*.vercel.app` when hosting the UI on Vercel.
- Deploy from the repository root; Vercel will use the `api` function as the backend.

The API is available at `http://localhost:4000/api`; use `POST /api/auth/login` for a bearer token. Completed purchases and sales use MongoDB transactions, so production MongoDB must run as a replica set (a single-node replica set is sufficient for local development).
The API is available at `http://localhost:4000/api`; use `POST /api/auth/login` for a bearer token. All application collections are created in the `sovonlpg` database. Completed purchases and sales use MongoDB transactions, so production MongoDB must run as a replica set (a single-node replica set is sufficient for local development).

## Rules encoded

Sales accept only cylinder type and count. LPG KG is calculated server-side. FIFO consumes purchase batches in batch-date order and persists each allocation, cost, COGS, revenue, and gross profit on the sale. Voiding a sale restores its exact allocated KG and preserves the original record.

All successful responses use `{ success, message, data }`; validation and operational errors use `{ success: false, message, errors?, data? }`. List responses include pagination metadata.

## Tests

Run `npm.cmd test` on PowerShell if the local execution policy blocks the `npm` shim.
