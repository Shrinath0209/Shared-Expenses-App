# SplitEase — Shared Expenses App
### Spreetail Software Developer Assignment

A full-stack shared expense tracker built for Aisha, Rohan, Priya, Meera, Dev, and Sam — their flat's messy spreadsheet converted into a proper app.

---

## 🚀 Live Demo

> **Deployed URL:** _(See submission form — deployed on Render/Railway after this README)_

**Demo Accounts:**
| Name | Email | Password |
|------|-------|----------|
| Aisha | aisha@flatmates.com | password123 |
| Rohan | rohan@flatmates.com | password123 |
| Priya | priya@flatmates.com | password123 |
| Sam | sam@flatmates.com | password123 |

---

## 🛠️ Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Backend | Node.js + Express | Lightweight, familiar, fast to iterate |
| Database | SQLite via @libsql/client | Relational, zero-install, WASM-based (no native build) |
| Frontend | React 18 + Vite | Fast HMR, component-based UI |
| Auth | JWT (jsonwebtoken) + bcryptjs | Stateless, secure |
| CSV parsing | csv-parse | Robust, handles BOM, relax_column_count |
| HTTP client | Axios | Interceptors for auth token |

---

## 🤖 AI Tools Used

**Primary:** Antigravity (Google DeepMind's agentic coding assistant)

All AI prompts, corrections, and cases where AI was wrong are documented in `AI_USAGE.md`.

---

## 📋 Features

### Core
- ✅ **Login / Register** — JWT-based auth with bcrypt hashing
- ✅ **Create & manage groups** — Multiple expense groups per user
- ✅ **Time-aware membership** — `joined_at` / `left_at` per member
- ✅ **Create & manage expenses** — Equal, Exact, Percentage, Shares splits
- ✅ **Group-wise balances** — Who owes whom (debt-minimization algorithm)
- ✅ **Individual breakdown** — Per-person expense trace (answers Rohan's request)
- ✅ **Settle debts** — Record payments, auto-update balances
- ✅ **CSV Import** — Detects 14+ anomaly types, surfaces every issue to user
- ✅ **Import Report** — Saved to DB, viewable any time

### Anomaly Detection (14 types)
| Code | Anomaly | Action |
|------|---------|--------|
| A1 | Missing description | Use "Unknown Expense" |
| A2 | Invalid/non-numeric amount | Skip row |
| A3 | Zero amount | Skip row |
| A4 | Negative amount | Treat as refund (flip sign) |
| A5 | USD currency | Convert at ₹83.50/$ rate |
| A6 | Invalid/unparseable date | Skip row |
| A7 | Future date | Import but flag |
| A8 | Unknown or missing payer | Skip row |
| A9 | Payer inactive on expense date | Import but flag |
| A10 | Settlement disguised as expense | Mark as settlement |
| A11 | Exact duplicate (same date+desc+amount+payer) | Skip second |
| A12 | Conflicting duplicate (same key, different amount) | Keep first, skip second |
| A13 | Split member inactive at expense date | Exclude from split |
| A14 | Unknown split type | Default to equal |

---

## ⚙️ Setup Instructions

### Prerequisites
- Node.js v18+ (tested on v24.13.1)
- npm v8+

### Backend
```bash
cd backend
npm install --ignore-scripts
node server.js
# Server starts on http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# App opens at http://localhost:5173
```

### Environment Variables (optional)
```env
# backend/.env
PORT=5000
JWT_SECRET=your-secret-key
FRONTEND_URL=http://localhost:5173
```

### Running Both Together (Windows)
```powershell
# Terminal 1
cd backend; node server.js

# Terminal 2
cd frontend; npm run dev
```

---

## 📁 Project Structure

```
Asignment/
├── backend/
│   ├── server.js          # Express entry point
│   ├── db.js              # SQLite schema + helpers
│   ├── middleware/
│   │   └── auth.js        # JWT verify middleware
│   └── routes/
│       ├── auth.js        # POST /api/auth/register|login
│       ├── groups.js      # CRUD for groups + membership
│       ├── expenses.js    # CRUD for expenses + splits
│       ├── balances.js    # Balance computation + debt simplification
│       ├── settlements.js # Record payments
│       └── import.js      # CSV import with anomaly detection
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── api.js         # Axios client
│       ├── context/AuthContext.jsx
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   └── GroupDetail.jsx
│       └── components/
│           ├── Sidebar.jsx
│           ├── ExpenseModal.jsx
│           ├── SettlementModal.jsx
│           └── ImportModal.jsx
├── expenses_export.csv    # The provided CSV (unmodified)
├── README.md
├── SCOPE.md
├── DECISIONS.md
└── AI_USAGE.md
```

---

## 🗄️ Database Schema

See `SCOPE.md` for the full schema and all anomaly documentation.
