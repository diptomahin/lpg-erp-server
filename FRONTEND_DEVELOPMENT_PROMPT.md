# Frontend Development Prompt

Build a complete professional React frontend for the LPG ERP backend documented in [BACKEND_DOCUMENTATION.md](BACKEND_DOCUMENTATION.md).

The frontend must consume the existing REST API exactly. Do not invent endpoints, rename response fields, or duplicate financial and inventory logic.

## Technology

Use:

- React with Vite
- JavaScript/JSX, not TypeScript
- React Router
- Tailwind CSS
- Axios
- TanStack Query
- React Hook Form
- Zod
- Lucide React

Use a centralized Axios client in `src/services/apiClient.js`. Every API call must go through service modules. Components must not contain scattered raw Axios requests.

## Backend configuration

Create `.env.example`:

```env
VITE_API_URL=http://localhost:4000
```

The client must call `${VITE_API_URL}/api/...`. Do not append `/api` twice.

Protected requests must send:

```text
Authorization: Bearer <token>
```

On HTTP 401, clear the authenticated session and redirect to `/login`. Do not expose stack traces or credentials.

## API response handling

Success responses use:

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

Paginated list data is nested as:

```js
response.data.data.rows;
response.data.data.pagination;
```

The pagination object contains `page`, `limit`, `total`, and `totalPages`.

A sale detail response is shaped as:

```js
response.data.data.sale;
response.data.data.allocations;
```

Inventory data is shaped as:

```js
response.data.data.availableKg;
response.data.data.batches;
```

An error may include structured inventory data:

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

Render that as a useful message showing required, available, and shortage KG.

## Business rules

This is an LPG wholesale/distribution system, not a traditional POS.

- The business buys LPG in exact delivery quantities, which may be supplied in KG or TON, and stores inventory in KG.
- One TON equals 1,000 KG.
- Customers buy complete filled cylinders owned by them.
- Supported cylinder capacities include 12 KG, 30 KG, 35 KG, and 45 KG.
- Customers may buy multiple cylinder types in one sale.
- Never provide an arbitrary LPG quantity field in the sale form.
- The frontend may preview `capacityKg × cylinderCount`.
- The backend remains authoritative for total LPG, revenue, FIFO, COGS, gross profit, inventory, payments, and balances.
- Do not ask users to select purchase batches during sale creation.
- Do not treat cylinders as inventory assets.
- Do not show internal FIFO allocation on the customer-facing invoice.

## Application layout and routes

Build a responsive sidebar, topbar, and main content layout. Use a compact, professional business interface with tables, forms, filters, summary cards, and clear financial values. Do not add unnecessary charts or marketing sections.

Routes:

```text
/login
/dashboard
/customers
/customers/new
/customers/:id
/customers/:id/edit
/suppliers
/suppliers/new
/suppliers/:id
/suppliers/:id/edit
/cylinder-types or /settings/cylinder-types
/purchases
/purchases/new
/purchases/:id
/sales
/sales/new
/sales/:id
/payments/customer
/payments/supplier
/inventory
/inventory/movements
/expenses
/expenses/new
/prices
/reports
```

Navigation must support role-aware visibility. Admin-only UI actions include price changes, stock adjustments, transaction voiding, and master-data management. The backend remains the final authorization authority.

## Authentication

Implement:

- Login form at `/login`
- Protected routes
- Auth context or equivalent small session state
- Logout
- 401 handling
- Authenticated user loading from `/api/auth/me`
- No password storage or display

Use a documented token strategy. Keep the implementation simple and avoid an unnecessary global store.

## Dashboard

Use:

```text
GET /api/dashboard/summary
GET /api/dashboard/recent-sales
GET /api/dashboard/recent-purchases
GET /api/dashboard/recent-payments
```

Display:

- Today's sales
- Today's LPG sold
- Today's cylinders sold
- Customer due
- Supplier payable
- Available LPG
- Today's expenses
- Today's gross profit
- Recent sales, purchases, and payments tables

The dashboard summary uses the daily report metric names returned by the backend, including `totalSales`, `totalLpgSold`, `totalCylindersSold`, `customerDue`, `supplierPayable`, `currentLpgStock`, `totalExpenses`, and `grossProfit`.

## Customers and suppliers

Customer endpoints:

```text
GET/POST /api/customers
GET/PUT/DELETE /api/customers/:id
GET /api/customers/:id/ledger
GET /api/customers/:id/sales
GET /api/customers/:id/payments
```

Supplier endpoints:

```text
GET/POST /api/suppliers
GET/PUT/DELETE /api/suppliers/:id
GET /api/suppliers/:id/ledger
GET /api/suppliers/:id/purchases
GET /api/suppliers/:id/payments
```

Lists must support search, pagination, loading, empty, error, and status states.

Customer table:

```text
Name, Company, Phone, Current Due, Status, Actions
```

Supplier table:

```text
Name, Company, Phone, Current Payable, Status, Actions
```

Customer creation and editing must include an `Existing receivable` field: the amount this customer already owes the business from the physical ledger. Supplier creation and editing must include an `Existing payable` field: the amount the business already owes that supplier. Send these as `existingReceivable` and `existingPayable`; do not send `openingBalance` or `totalDue`. The backend returns the updated `totalDue` after saving.

Detail pages must show information, current balance/payable, transaction history, payment history, and a ledger tab. Ledger endpoints return an array of entries containing `date`, `description`, `reference`, `debit`, `credit`, `balance`, and `source`.

Use `from` and `to` query parameters for ledger date filters.

## Cylinder types

Use:

```text
GET/POST /api/cylinder-types
PUT/DELETE /api/cylinder-types/:id
```

Allow admin users to add, edit, activate, and deactivate types. `capacityKg` must be positive.

## Purchases

Use:

```text
GET /api/purchases
POST /api/purchases
GET /api/purchases/:id
POST /api/purchases/:id/void
GET /api/purchase-batches
GET /api/purchase-batches/:id
```

Purchase form fields:

```text
Supplier
Purchase date
Quantity in KG (recommended; supports values such as 7689 and 11340)
Purchase rate per KG
Additional cost
Initial payment
Notes
```

Client preview only:

```text
quantityTon = quantityKg ÷ 1000
subtotal = quantityKg × purchaseRatePerKg
totalCost = subtotal + additionalCost
```

The frontend may send either `quantityKg` or `quantityTon`, but must always send `purchaseRatePerKg`. Do not send `purchaseRatePerTon`; the backend derives it for storage and historical display. The backend calculates and stores both TON and KG values. Display purchase number, quantity TON/KG, rate per KG, additional cost, total cost, paid, due, payment status, batch number, remaining KG, batch cost/KG, and batch status.

After creation, invalidate purchases, batches, inventory, suppliers, dashboard, and reports.

Require confirmation before voiding. Explain that a purchase cannot be voided after its batch has been consumed.

## Cylinder-based sales

Use:

```text
GET /api/sales
POST /api/sales
GET /api/sales/:id
POST /api/sales/:id/void
```

Sale form fields:

```text
Customer
One or more cylinder rows
Discount
Initial payment
Payment method
Payment reference
Sale date
```

Each cylinder row contains only:

```text
Cylinder type
Cylinder count
Rate per KG
```

Do not include a manual LPG quantity input. For every row display:

```text
capacityKg × cylinderCount = totalLpgKg
```

Display live totals:

```text
Total cylinders
Total LPG
Subtotal
Discount
Total
Paid
Due
```

Example:

```text
5 × 12 KG = 60 KG
2 × 30 KG = 60 KG
1 × 45 KG = 45 KG
Total cylinders = 8
Total LPG = 165 KG
```

The request must send cylinder type IDs, counts, rates, discount, and optional initial payment. Do not send a client-authoritative `totalLpgKg`, COGS, gross profit, or batch allocation.

After creation, trust the server response and invalidate:

```text
sales, inventory, customers, dashboard, reports
```

Sale details must show invoice/customer information, cylinder items, revenue, COGS, gross profit, paid, due, payment history when available, and FIFO allocations from `data.allocations`. FIFO is internal information and must not appear on the normal customer invoice.

Show a sale success state with view invoice, print, and back-to-sales actions.

Require confirmation before voiding. Explain that voiding restores allocated inventory and reverses financial effects.

## Payments

Customer payments:

```text
GET/POST /api/customer-payments
GET /api/customer-payments/:id
```

Supplier payments:

```text
GET/POST /api/supplier-payments
GET /api/supplier-payments/:id
```

Support partial, multiple, later, and general account payments. Linked payments may include a sale or purchase. Validate amount as positive and show backend errors when the amount exceeds outstanding balance.

After a payment, invalidate the relevant payment list, party details, ledger, dashboard, and reports.

## Inventory and adjustments

Use:

```text
GET /api/inventory
GET /api/stock-movements
POST /api/stock-adjustments
```

Inventory page:

- Show `availableKg`
- Show batch table with date, original KG, remaining KG, cost/KG, status
- Support search/date/status filters where applicable
- Keep tables horizontally scrollable on narrow screens

Movement table:

```text
Date, Movement Number, Type, Quantity KG, Batch, Reference, User
```

Admin stock adjustment form:

```text
Adjustment type: ADJUSTMENT_IN or ADJUSTMENT_OUT
Quantity KG
Batch
Reason
Notes
```

Require confirmation and display:

```text
Stock adjustments affect inventory records.
```

## Expenses and prices

Expenses:

```text
GET/POST /api/expenses
GET/PUT/DELETE /api/expenses/:id
```

Fields:

```text
Category, Amount, Expense Date, Payment Method, Description, Notes
```

Prices:

```text
GET /api/prices
POST /api/prices
```

Show current/general prices, customer-specific prices, and price history. Only show price modification actions to admins. The backend must snapshot the selected rate into completed sales.

## Reports

Use:

```text
GET /api/reports/daily
GET /api/reports/monthly
GET /api/reports/sales
GET /api/reports/purchases
GET /api/reports/inventory
GET /api/reports/profit
GET /api/reports/batch-profit
GET /api/reports/customer-dues
GET /api/reports/supplier-payables
GET /api/reports/expenses
```

Build report tabs or pages for daily, monthly, sales, purchases, inventory, profit, batch profit, customer dues, supplier payables, and expenses. Use date range filters and tables. Do not add charts.

Daily report cards use:

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

Monthly report cards use:

```text
totalLpgPurchased
totalLpgSold
totalSalesRevenue
totalCogs
grossProfit
totalExpenses
operatingProfit
customerPayments
supplierPayments
closingLpgStock
customerOutstanding
supplierOutstanding
```

Batch profit table:

```text
Batch number
Original KG
Sold KG
Remaining KG
Purchase cost
Revenue generated
COGS
Realized gross profit
```

Never display unsold inventory as realized profit.

## Invoice and printing

Create a print-friendly customer invoice containing only:

- Business name and information
- Invoice number and date
- Customer information
- Cylinder items
- Quantity, rate/KG, amount
- Total cylinders and total LPG
- Subtotal, discount, total
- Paid, due, payment status

Do not include batch IDs, FIFO allocations, internal cost, or technical database fields on the customer invoice.

## Reusable components

Create reusable components under `src/components/`:

```text
common/Button
common/Input
common/Select
common/DatePicker
common/Modal
common/ConfirmDialog
common/Card
common/Badge
common/EmptyState
common/LoadingState
common/ErrorState
common/Toast
forms/FormField
forms/FilterBar
tables/Table
tables/Pagination
CurrencyDisplay
QuantityDisplay
StatusBadge
```

Use Lucide icons for recognizable actions and provide tooltips for unfamiliar icon-only controls.

## Recommended structure

```text
src/
├── components/
├── pages/
│   ├── auth/
│   ├── dashboard/
│   ├── customers/
│   ├── suppliers/
│   ├── purchases/
│   ├── sales/
│   ├── inventory/
│   ├── payments/
│   ├── expenses/
│   ├── prices/
│   ├── reports/
│   └── settings/
├── services/
│   ├── apiClient.js
│   ├── authService.js
│   ├── customerService.js
│   ├── supplierService.js
│   ├── cylinderService.js
│   ├── purchaseService.js
│   ├── saleService.js
│   ├── paymentService.js
│   ├── inventoryService.js
│   ├── expenseService.js
│   ├── priceService.js
│   ├── reportService.js
│   └── dashboardService.js
├── hooks/
├── contexts/
├── schemas/
├── utils/
├── routes/
├── layouts/
├── App.jsx
└── main.jsx
```

Use TanStack Query for server state, React state for local UI/form state, debounced search, pagination, lazy routes where useful, and query invalidation after mutations. Do not create a large Redux store.

Every page must visibly handle loading, success, empty, and error states. Every destructive action must require confirmation.

## Acceptance workflow

Verify this flow against the live backend:

```text
Login
Create supplier
Create 10 TON purchase
Confirm inventory increases by 10,000 KG
Create customer
Create sale: 5 × 12 KG, 2 × 30 KG, 1 × 45 KG
Confirm frontend preview is 8 cylinders and 165 KG
Submit sale and trust backend totals
Confirm inventory decreases by 165 KG
Confirm COGS and gross profit display
Record a partial customer payment
Confirm customer ledger updates
Record a supplier payment
Confirm supplier ledger updates
Record an expense
Confirm daily and monthly report values update
```

Also verify:

```text
Batch A remaining: 8 KG
Batch B available: at least 4 KG
Sale: 1 × 12 KG
Backend allocations: 8 KG from A and 4 KG from B
Customer-facing item: 1 × 12 KG cylinder
Inventory reduction: 12 KG
COGS: 8 × A cost + 4 × B cost
```

The frontend is responsible for data entry, validation feedback, navigation, visualization, reports, and printing. The backend is responsible for business rules, transactions, FIFO, costing, inventory, ledgers, balances, authorization, and data integrity.
