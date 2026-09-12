# LPG ERP Backend Documentation

## 1. Overview

This backend is a Node.js ES-module API for LPG wholesale and distribution. It manages bulk LPG purchases, authoritative purchase batches, cylinder-based sales, FIFO costing, inventory movements, receivables, supplier payables, payments, expenses, ledgers, audit events, and operational reports.

The system is not a cylinder asset inventory and not an arbitrary-KG retail POS. Customers buy complete filled cylinders. The backend internally consumes LPG in KG from purchase batches.

## 2. Technology

- Node.js 20+
- Express 5
- MongoDB with Mongoose
- JWT authentication
- bcryptjs password hashing
- Zod request validation
- dotenv environment configuration
- Helmet security headers
- CORS
- Morgan request logging
- Node's built-in test runner

## 3. Project Structure

```text
src/
├── app.js
├── server.js
├── seed.js
├── config/
│   ├── db.js
│   └── env.js
├── controllers/
│   └── coreController.js
├── middleware/
│   ├── auth.js
│   ├── error.js
│   └── rateLimit.js
├── models/
│   └── index.js
├── routes/
│   └── api.js
├── services/
│   ├── authService.js
│   ├── fifoService.js
│   ├── inventoryService.js
│   ├── ledgerService.js
│   ├── paymentService.js
│   ├── purchaseService.js
│   ├── reportingService.js
│   └── saleService.js
├── utils/
│   ├── api.js
│   └── numbers.js
└── validators/
    └── index.js

test/
└── fifo.test.js
```

## 4. Installation and Configuration

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run seed
npm.cmd start
```

Development mode:

```powershell
npm.cmd run dev
```

The default server URL is `http://localhost:4000`.

### Environment variables

| Variable         | Purpose                           |
| ---------------- | --------------------------------- |
| `PORT`           | HTTP port, default `4000`         |
| `MONGO_URI`      | MongoDB connection string         |
| `MONGO_DB`       | Database name, default `sovonlpg` |
| `JWT_SECRET`     | Secret used to sign JWTs          |
| `JWT_EXPIRES_IN` | Token lifetime, default `1d`      |
| `NODE_ENV`       | Runtime environment               |
| `CLIENT_ORIGIN`  | Allowed frontend origin           |

Never commit `.env`. The repository ignores it; `.env.example` contains placeholders only. The backend forces the Mongoose connection database to `MONGO_DB`, so the default database is `sovonlpg` even when the connection string does not include a database path.

MongoDB transactions require a replica set. MongoDB Atlas supports this by default.

## 5. Response Format

Success responses:

```json
{
  "success": true,
  "message": "Sale created successfully",
  "data": {}
}
```

Paginated list responses:

```json
{
  "success": true,
  "message": "Records fetched",
  "data": {
    "rows": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

Errors:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": []
}
```

Inventory shortage errors include structured data:

```json
{
  "success": false,
  "message": "Insufficient LPG inventory",
  "data": {
    "requiredKg": 120,
    "availableKg": 100,
    "shortageKg": 20
  }
}
```

## 6. Authentication

### Login

`POST /api/auth/login`

```json
{
  "email": "admin@example.com",
  "password": "ChangeMe123!"
}
```

The response contains `data.token` and `data.user`. Passwords are excluded from user responses.

### Current user

`GET /api/auth/me`

Requires:

```text
Authorization: Bearer <token>
```

Roles are `admin` and `staff`. Admin-only operations are protected on the backend.

## 7. LPG Business Rules

### Units

- All authoritative inventory quantities are KG.
- One TON equals 1,000 KG.
- Decimal KG values are supported.
- Purchases may be entered in exact KG (for example, 7,689 KG or 11,340 KG) or in TON. The backend stores both normalized TON and KG values.

### Purchases and batches

Every completed purchase creates exactly one purchase batch. The batch stores original quantity, remaining quantity, purchase cost, additional cost, and acquisition cost per KG. Batch costs are snapshots and must not be changed by later price changes.

### Sales

Sale input contains cylinder type, cylinder count, and rate per KG. The backend calculates:

```text
item LPG = cylinder capacity × cylinder count
total LPG = sum of item LPG
total amount = sum(item LPG × rate) - discount
```

A sale never accepts arbitrary customer-entered LPG quantity.

### FIFO

The oldest available batch is consumed first. One sale can create multiple `SaleBatchAllocation` records. A 12 KG cylinder may consume 8 KG from one batch and 4 KG from another, while remaining one complete customer-facing cylinder.

### Historical values

Completed sales retain item capacity, cylinder count, rate, LPG quantity, revenue, allocation quantities, cost per KG, COGS, and gross profit. Future price or purchase changes do not alter historical records.

### Payments and balances

`existingReceivable` and `existingPayable` are live outstanding balances. A customer sale increases `existingReceivable`; a customer payment decreases it. A supplier purchase increases `existingPayable`; a supplier payment decreases it. Voiding a transaction reverses the corresponding change. `totalDue` mirrors these live values for compatibility. Linked payments cannot exceed the outstanding amount.

## 8. Data Models

The following Mongoose models exist:

- `User`
- `Customer`
- `Supplier`
- `CylinderType`
- `Purchase`
- `PurchaseBatch`
- `Sale`
- `SaleBatchAllocation`
- `CustomerPayment`
- `SupplierPayment`
- `Expense`
- `ExpenseCategory`
- `StaffMember`
- `SalaryPayment`
- `ProfitSharePayment`
- `StockMovement`
- `PriceHistory`
- `AuditLog`

`StaffMember` stores a fixed employee monthly salary in `monthlySalary` and supports `isEmployee`, `isPartner`, and optional `partnerSharePercent`. `SalaryPayment` records a specific payment against an employee for the current period, while `ProfitSharePayment` captures partner payouts.

Important indexed identifiers include purchase numbers, invoice numbers, payment numbers, batch numbers, and transaction dates. User passwords use `select: false`.

## 9. REST API

All routes below are prefixed with `/api`. Except login, routes require a bearer token.

### Frontend operation sequence

Use this order when starting with an empty database:

1. Run `npm.cmd run seed` to create the admin account, cylinder types, and expense categories.
2. Login with `POST /auth/login` and store `data.token`.
3. Create or load suppliers and customers.
4. Create purchases. Each purchase creates inventory, a purchase batch, a stock movement, and an optional supplier payment.
5. Create sales using complete cylinder types and counts. The server consumes stock using FIFO and calculates cost and profit.
6. Record later customer or supplier payments when balances are collected or settled.
7. Record expenses and load reports for the selected date range.

Send JSON with `Content-Type: application/json`. Send `Authorization: Bearer <token>` on every request except login. IDs in examples are MongoDB ObjectId strings returned by earlier responses.

### Authentication

| Method | Route         |
| ------ | ------------- |
| `POST` | `/auth/login` |
| `GET`  | `/auth/me`    |

### People and payroll

| Method | Route              |
| ------ | ------------------ |
| `GET`  | `/people`          |
| `POST` | `/people`          |
| `PUT`  | `/people/:id`      |
| `GET`  | `/salary-payments` |
| `POST` | `/salary-payments` |
| `GET`  | `/profit-shares`   |
| `POST` | `/profit-shares`   |

Employee/person payload:

```json
{
  "name": "Ayesha Rahman",
  "phone": "+1-555-0101",
  "email": "ayesha@example.com",
  "address": "Dhaka",
  "isEmployee": true,
  "isPartner": false,
  "monthlySalary": 45000,
  "status": "active",
  "notes": "Field supervisor"
}
```

`monthlySalary` is the employee's fixed monthly entitlement managed in the salary route; the backend persists it as a numeric field on the person record. `PUT /people/:id` updates the person row and accepts the same fields. Salary payment records are separate from operating expenses and are created through `/salary-payments`.

### Customers

| Method   | Route                     |
| -------- | ------------------------- |
| `GET`    | `/customers`              |
| `POST`   | `/customers`              |
| `GET`    | `/customers/:id`          |
| `PUT`    | `/customers/:id`          |
| `DELETE` | `/customers/:id`          |
| `GET`    | `/customers/:id/ledger`   |
| `GET`    | `/customers/:id/sales`    |
| `GET`    | `/customers/:id/payments` |

Customer list search uses `search` against name, company, and phone. Ledger supports `from` and `to`.

Create customer:

```json
{
  "name": "Metro Restaurant",
  "companyName": "Metro Foods Ltd",
  "phone": "+1-555-0100",
  "address": "12 Market Street",
  "existingReceivable": 12500,
  "creditLimit": 50000,
  "notes": "Wholesale customer"
}
```

`existingReceivable` is the amount this customer already owes the business when migrated from the physical ledger. It remains the live amount due: sales increase it, customer payments decrease it, and voided sales reverse it. The response includes `totalDue`, which mirrors the current `existingReceivable`. Do not send `totalDue` from the frontend. `existingReceivable` is initialized during migration and is not directly editable through normal updates. `DELETE` is a soft deactivation and does not remove historical sales.

Supplier create/update uses `name`, `companyName`, `phone`, `address`, `existingPayable`, and `notes`. `existingPayable` is the amount the business already owes that supplier when migrated from the physical ledger. It remains the live amount payable: purchases increase it, supplier payments decrease it, and voided purchases reverse it. The response includes persisted `totalDue`, which mirrors the current `existingPayable`. Do not send `totalDue` from the frontend. `existingPayable` is initialized during migration and is not directly editable through normal updates. Supplier deletion is also a soft deactivation.

Example supplier migration payload:

```json
{
  "name": "Apex LPG Supply",
  "companyName": "Apex Energy Ltd",
  "phone": "+1-555-0200",
  "existingPayable": 38000,
  "notes": "Imported from physical supplier ledger"
}
```

### Suppliers

| Method   | Route                      |
| -------- | -------------------------- |
| `GET`    | `/suppliers`               |
| `POST`   | `/suppliers`               |
| `GET`    | `/suppliers/:id`           |
| `PUT`    | `/suppliers/:id`           |
| `DELETE` | `/suppliers/:id`           |
| `GET`    | `/suppliers/:id/ledger`    |
| `GET`    | `/suppliers/:id/purchases` |
| `GET`    | `/suppliers/:id/payments`  |

### Cylinder types

| Method   | Route                 |
| -------- | --------------------- |
| `GET`    | `/cylinder-types`     |
| `POST`   | `/cylinder-types`     |
| `PUT`    | `/cylinder-types/:id` |
| `DELETE` | `/cylinder-types/:id` |

`capacityKg` must be positive.

```json
{
  "name": "12 KG",
  "capacityKg": 12,
  "status": "active"
}
```

### Purchases and batches

| Method | Route                   |
| ------ | ----------------------- |
| `GET`  | `/purchases`            |
| `POST` | `/purchases`            |
| `GET`  | `/purchases/:id`        |
| `POST` | `/purchases/:id/void`   |
| `GET`  | `/purchase-batches`     |
| `GET`  | `/purchase-batches/:id` |

Purchase input:

```json
{
  "supplier": "ObjectId",
  "quantityKg": 7689,
  "purchaseRatePerKg": 84.5,
  "additionalCost": 0,
  "purchaseDate": "2026-09-02T00:00:00.000Z",
  "totalPaid": 0,
  "notes": ""
}
```

`quantityKg` and `purchaseRatePerKg` are recommended because deliveries do not need to be whole tons. Provide exactly one quantity field (`quantityKg` or `quantityTon`). `purchaseRatePerKg` is always required; the server derives and stores `purchaseRatePerTon` for display and historical compatibility. Do not send `purchaseRatePerTon` in the request.

The result includes the created purchase. The related batch can be obtained using the purchase relationship from `/purchase-batches`.

A purchase can only be voided while its batch is entirely unused. Voiding cancels the batch, creates a correction movement, voids linked payments, and preserves the purchase record.

Do not send calculated fields such as `subtotal`, `totalCost`, `totalDue`, or `paymentStatus`; the server owns them. `totalPaid` is optional and cannot exceed the calculated total cost.

### Sales

| Method | Route             |
| ------ | ----------------- |
| `GET`  | `/sales`          |
| `POST` | `/sales`          |
| `GET`  | `/sales/:id`      |
| `POST` | `/sales/:id/void` |

Sale input:

```json
{
  "customer": "ObjectId",
  "items": [
    {
      "cylinderType": "ObjectId",
      "cylinderCount": 5,
      "ratePerKg": 150
    }
  ],
  "discount": 0,
  "totalPaid": 0,
  "saleDate": "2026-09-02T00:00:00.000Z"
}
```

The sale detail response is:

```json
{
  "sale": {},
  "allocations": []
}
```

Voiding a sale restores each allocated batch quantity, creates return movements, voids linked payments, preserves the sale, and writes an audit event.

Do not send `totalLpgKg`, `totalAmount`, `totalCost`, `grossProfit`, or `totalDue`; these are calculated and persisted by the server.

### Payments

| Method | Route                    |
| ------ | ------------------------ |
| `GET`  | `/customer-payments`     |
| `POST` | `/customer-payments`     |
| `GET`  | `/customer-payments/:id` |
| `GET`  | `/supplier-payments`     |
| `POST` | `/supplier-payments`     |
| `GET`  | `/supplier-payments/:id` |

A customer payment may contain `customer` and optional `sale`. A supplier payment may contain `supplier` and optional `purchase`. General payments omit the transaction reference.

```json
{
  "customer": "ObjectId",
  "sale": "ObjectId",
  "amount": 20000,
  "paymentDate": "2026-09-02T00:00:00.000Z",
  "paymentMethod": "cash",
  "reference": "RCPT-001",
  "notes": ""
}
```

### Expenses, prices, and inventory

| Method                | Route                                               |
| --------------------- | --------------------------------------------------- |
| `GET/POST/PUT/DELETE` | `/expenses` and `/expenses/:id`                     |
| `GET/POST/PUT/DELETE` | `/expense-categories` and `/expense-categories/:id` |
| `GET/POST/PUT/DELETE` | `/prices` and `/prices/:id`                         |
| `GET`                 | `/inventory`                                        |
| `GET`                 | `/stock-movements`                                  |
| `POST`                | `/stock-adjustments`                                |

Stock adjustment input:

```json
{
  "type": "ADJUSTMENT_IN",
  "quantityKg": 10,
  "batch": "ObjectId",
  "reason": "Physical count correction",
  "notes": ""
}
```

Stock adjustments are admin-only and reject an outbound quantity greater than the batch's remaining KG.

Expense create payload:

```json
{
  "category": "ObjectId",
  "amount": 850,
  "expenseDate": "2026-09-08T00:00:00.000Z",
  "paymentMethod": "cash",
  "description": "Vehicle fuel",
  "notes": "Delivery van"
}
```

Expense category create payload is `{ "name": "FUEL", "status": "active" }`. Price create payload is `{ "effectiveDate": "2026-09-01T00:00:00.000Z", "ratePerKg": 150, "customer": "ObjectId", "notes": "September list" }`. Expense category and price IDs are supplied by the corresponding list endpoints.

### Reports

| Method | Route                        |
| ------ | ---------------------------- |
| `GET`  | `/reports/daily`             |
| `GET`  | `/reports/monthly`           |
| `GET`  | `/reports/sales`             |
| `GET`  | `/reports/purchases`         |
| `GET`  | `/reports/inventory`         |
| `GET`  | `/reports/profit`            |
| `GET`  | `/reports/batch-profit`      |
| `GET`  | `/reports/customer-dues`     |
| `GET`  | `/reports/supplier-payables` |
| `GET`  | `/reports/expenses`          |

Daily and monthly reports accept `from` and `to`. Sales and purchase reports also return paginated rows.

Use ISO dates and inclusive boundaries, for example `/reports/monthly?from=2026-08-01&to=2026-08-31`. List endpoints accept `page` and `limit`; default pagination is returned in the response. Dashboard and report values are server calculations and should replace optimistic frontend totals after each mutation.

Daily report fields include:

```text
 totalSales
 totalLpgSold
 totalCylindersSold
 totalCustomerPayments
 totalSupplierPayments
 totalExpenses
 grossProfit
 operatingProfit
 customerDue
 supplierPayable
 currentLpgStock
```

Monthly report fields include purchased KG, sold KG, revenue, COGS, gross profit, expenses, operating profit, payment totals, closing stock, and outstanding totals.

Batch profit reports include original KG, sold KG, remaining KG, purchase cost, generated revenue, COGS, and realized gross profit. Remaining inventory is not treated as realized profit.

### Dashboard

| Method | Route                         |
| ------ | ----------------------------- |
| `GET`  | `/dashboard/summary`          |
| `GET`  | `/dashboard/recent-sales`     |
| `GET`  | `/dashboard/recent-purchases` |
| `GET`  | `/dashboard/recent-payments`  |

Dashboard summary uses the current day's report metrics. Recent endpoints return up to ten records.

## 10. Transactions and Integrity

Purchase creation is atomic across purchase, batch, stock movement, initial supplier payment, and audit log.

Sale creation is atomic across customer validation, cylinder validation, FIFO allocation, batch updates, sale, allocations, stock movements, initial customer payment, and audit log.

If any transaction step fails, MongoDB rolls back all writes.

## 11. Audit Events

Important events use actions such as:

- `CREATE`
- `UPDATE`
- `VOID`
- `PAYMENT`
- `STOCK_ADJUSTMENT`
- `PRICE_CHANGE`

Audit records retain the acting user, entity type, entity ID, and new data snapshot.

## 12. Testing

Run:

```powershell
npm.cmd test
```

Current automated coverage includes:

- TON to KG conversion
- Cylinder multiplication
- Decimal KG arithmetic
- FIFO allocation across batches
- One complete cylinder split across multiple batches
- Insufficient inventory behavior

For production readiness, add MongoDB integration tests against a replica-set test database covering purchase creation, sale creation, payment rollups, ledgers, reversal, reports, and authorization.

## 13. Frontend Integration Notes

- Set the frontend `VITE_API_URL` to `http://localhost:4000`.
- Call `/api/...`; do not append `/api` twice.
- Attach `Authorization: Bearer <token>` to protected requests.
- Read paginated lists from `response.data.data.rows`.
- Read pagination from `response.data.data.pagination`.
- Read sale detail allocations from `response.data.data.allocations`.
- The frontend may calculate cylinder preview quantities, but must trust the server's final totals, allocations, COGS, profit, balances, and inventory.
- Do not expose FIFO batch allocations on the customer-facing invoice.

### Operation-to-data effects

| Frontend operation      | Main document       | Related documents created or changed                                                                                                                |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create purchase         | `Purchase`          | `PurchaseBatch`, `StockMovement`, optional `SupplierPayment`, `AuditLog`                                                                            |
| Create sale             | `Sale`              | `SaleBatchAllocation`, `StockMovement`, optional `CustomerPayment`, `AuditLog`, consumed batches                                                    |
| Create purchase or sale | party record        | increments supplier `existingPayable` or customer `existingReceivable`; `totalDue` mirrors the same value                                           |
| Record customer payment | `CustomerPayment`   | decreases customer `existingReceivable` and `totalDue`; updates linked sale and writes `AuditLog`                                                   |
| Record supplier payment | `SupplierPayment`   | decreases supplier `existingPayable` and `totalDue`; updates linked purchase and writes `AuditLog`                                                  |
| Create expense          | `Expense`           | `Expense` document only; expense reports read active records                                                                                        |
| Stock adjustment        | `StockMovement`     | selected `PurchaseBatch.remainingQuantityKg`, `AuditLog`                                                                                            |
| Void sale               | existing `Sale`     | allocations restored, batches restored, return movements, linked payments voided, customer `existingReceivable` and `totalDue` reversed, `AuditLog` |
| Void purchase           | existing `Purchase` | unused batch cancelled, correction movement, linked payments voided, supplier `existingPayable` and `totalDue` reversed, `AuditLog`                 |

The database is `sovonlpg`; collection names are Mongoose's pluralized model names, including `users`, `customers`, `suppliers`, `cylindertypes`, `purchases`, `purchasebatches`, `sales`, `salebatchallocations`, `customerpayments`, `supplierpayments`, `expenses`, `expensecategories`, `stockmovements`, `pricehistories`, and `auditlogs`.
