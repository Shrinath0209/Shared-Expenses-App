# SCOPE.md — Anomaly Log & Database Schema

## Part 1: CSV Anomaly Log

Every data problem found in `expenses_export.csv` and how it was handled.

---

### Anomaly Inventory

The CSV contained **at least 14 deliberate anomalies** across the following categories:

---

#### A1 — Missing Description
**Rows:** Row 47 (empty description field)  
**What:** The `description` column is blank.  
**Policy:** Import with description `"Unknown Expense"` — a blank description is non-fatal; the rest of the row may be valid.  
**Code location:** `backend/routes/import.js` → `processCSV()` → `A1 check`

---

#### A2 — Invalid / Non-Numeric Amount
**Rows:** Rows 49 ("XYZ"), Row 51 ("AMOUNT UNCLEAR")  
**What:** The `amount` field contains text that cannot be parsed as a number.  
**Policy:** **Skip the row entirely.** We cannot safely guess the amount.  
**Code location:** `parseAmount()` → returns `{ error: '...' }` → skip flag set

---

#### A3 — Zero Amount
**Rows:** Row 50 (amount = 0)  
**What:** An expense of ₹0 is meaningless and likely a data entry error.  
**Policy:** Skip. A zero-amount row contributes nothing to balances and may confuse settlement logic.  
**Code location:** `A3 check` in `processCSV()`

---

#### A4 — Negative Amount (Refund)
**Rows:** Row 34 (amount = -1500)  
**What:** Negative value in the amount column. Could be a data entry error or a deliberate refund/credit.  
**Policy:** **Treat as refund** — flip to positive and import with `notes` flag. Rationale: The original amount is negative, which is a valid accounting concept (refund). We preserve it rather than discard it.  
**Code location:** `A4 check` → `isRefund = true`, `finalAmount = Math.abs(amount)`

---

#### A5 — Currency Mismatch (USD in INR spreadsheet)
**Rows:** Rows 39, 40, 42 (`$45`, `$120`, `$30` — Dev/Rohan/Aisha paying in USD during Goa trip)  
**What:** The spreadsheet was used in INR context, but some trip expenses were in USD. "The sheet pretends a dollar is a rupee." (Priya's complaint)  
**Policy:** Detect `$` prefix, convert at **₹83.50 per USD** (approximate rate at time of trip). Store original USD amount, `amount_inr`, and `exchange_rate` separately.  
**Why 83.50:** This is the approximate USD/INR rate for April 2026. Documented in `DECISIONS.md`.  
**Code location:** `parseAmount()` detects `$` → `A5 check` applies `USD_TO_INR = 83.5`

---

#### A6 — Unparseable / Invalid Calendar Date
**Rows:** Row 44 (`31/04/2026` — April 31 does not exist)  
**What:** April has only 30 days. This is a data entry error.  
**Policy:** **Skip the row.** An invalid date cannot be mapped to a point in time, making the expense ambiguous.  
**Code location:** `parseDate()` → validates via `new Date()` + day check → returns `{ error: '...' }`

---

#### A7 — Future Date
**Rows:** Row 45 (`15/06/2026` — date is in the future relative to import time)  
**What:** An expense dated after today. Could be a prepaid expense or data entry error.  
**Policy:** Import but flag. We don't discard future-dated expenses — they may be legitimate (prepaid bills), but the user should be aware.  
**Code location:** `A7 check` compares `date > today`

---

#### A8 — Unknown or Missing Payer
**Rows:** Row 47 (paid_by is blank)  
**What:** Cannot determine who paid. Without a payer, the expense cannot create any debt.  
**Policy:** **Skip the row.** We cannot fabricate a payer.  
**Code location:** `normalizeName()` returns `null` → `A8` skip

---

#### A9 — Payer Not Active on Expense Date
**Rows:** Row 46 (Meera paying on 01/04/2026, after her departure on 31/03/2026)  
**What:** Sam's question: "Why would March electricity affect my balance?" — the reverse is also true for Meera.  
**Policy:** Import but flag for review. We don't automatically delete — the expense may be legitimate (settling a pending bill). The flag prompts the user to approve or reject.  
**Code location:** `isMemberActive()` → `A9 check` with `IMPORT_FLAGGED` action

---

#### A10 — Settlement Disguised as Expense
**Rows:** Row 34 ("Sam's Share - Rohan settles with Sam")  
**What:** A settlement payment was logged as an expense in the spreadsheet.  
**Policy:** Detect by keyword scanning (`settlement`, `paid back`, `payment to`). Mark `is_settlement = 1`. This prevents double-counting in balance calculations.  
**Code location:** `A10 check` → `isSettlementKeyword` flag → `is_settlement` column set

---

#### A11 — Exact Duplicate
**Rows:** Row 31 is an exact copy of Row 10 (same date `10/03/2026`, description `Electricity Bill - February`, amount `2350`, payer `Rohan`)  
**Row 48:** Exact copy of Row 3 (same date, Internet, ₹800, Priya)  
**What:** The same expense was entered twice.  
**Policy:** **Skip the second occurrence.** The first row is canonical. We use a composite signature key: `date|description|amount|payer`.  
**Code location:** `seenSignatures` Map in `processCSV()` → `A11 check`

---

#### A12 — Conflicting Duplicate (Same Key, Different Amount)
**Rows:** Row 32 matches Row 12's date/description/payer but has amount `2400` vs `2050`.  
**What:** Two people logged the same dinner with different amounts — a reconciliation conflict.  
**Policy:** **Keep the first entry, skip the second.** We cannot know which is correct. The anomaly is surfaced so the user can investigate. Documented in the import report.  
**Code location:** Fuzzy key check in `processCSV()` → `A12 check`

---

#### A13 — Inactive Member in Split
**Rows:** Row 17 (`05/04/2026`, split includes `"Aisha,Rohan,Priya,Sam"` but Sam joined `15/04/2026`, not `05/04/2026`)  
**What:** Sam is included in a split for a date before she joined.  
**Policy:** **Exclude Sam from that specific split**, calculate equal split among only the active members. The anomaly is logged.  
**Code location:** `isMemberActive()` called for each split member → excluded if inactive

---

#### A14 — Unknown Split Type
**Rows:** Any row with an unrecognized `split_type` value  
**What:** The CSV has various split type spellings (`equally`, `ratio`, `custom`, `%`).  
**Policy:** Map known aliases to canonical types (`equal`, `exact`, `percentage`, `shares`). If still unrecognized, default to `equal` and flag.  
**Code location:** `splitTypeMap` in `processCSV()` → `A14 check`

---

#### Additional: Inconsistent Date Formats
**Rows:** Row 35 uses `DD-MM-YYYY`, Row 36 uses `DD/Mon/YYYY`, Row 37 uses `YYYY-MM-DD`  
**What:** The same spreadsheet uses multiple date formats.  
**Policy:** `parseDate()` tries 5 format regexes in sequence, accepting the first that matches and produces a valid calendar date.  
**Code location:** `parseDate()` with format array

---

## Part 2: Database Schema

```sql
-- Users: all flatmates (and anyone who registers)
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Groups: e.g. "Flat 4B - 2026"
CREATE TABLE groups_table (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Memberships: who is in a group and when (handles Meera leaving, Sam joining)
CREATE TABLE group_members (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id  INTEGER NOT NULL REFERENCES groups_table(id),
  user_id   INTEGER NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL,   -- ISO date: "2026-02-01"
  left_at   TEXT             -- NULL = still active; "2026-03-31" = left
);

-- Expenses: one row per expense (supports multi-currency)
CREATE TABLE expenses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id      INTEGER NOT NULL REFERENCES groups_table(id),
  description   TEXT NOT NULL,
  amount        REAL NOT NULL,       -- original amount in original currency
  currency      TEXT DEFAULT 'INR',  -- 'INR' or 'USD'
  amount_inr    REAL NOT NULL,       -- always in INR (converted if USD)
  exchange_rate REAL DEFAULT 1.0,    -- rate used for conversion
  paid_by       INTEGER NOT NULL REFERENCES users(id),
  split_type    TEXT NOT NULL,       -- 'equal' | 'exact' | 'percentage' | 'shares'
  expense_date  TEXT NOT NULL,       -- ISO date "2026-03-15"
  category      TEXT,
  notes         TEXT,
  is_settlement INTEGER DEFAULT 0,   -- 1 if this is a settlement, not an expense
  import_row    INTEGER,             -- CSV row number if imported
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Expense splits: how the expense is divided
CREATE TABLE expense_splits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id   INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  amount_owed  REAL NOT NULL   -- how much this person owes for this expense
);

-- Settlements: recorded payments between members
CREATE TABLE settlements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id        INTEGER NOT NULL REFERENCES groups_table(id),
  paid_by         INTEGER NOT NULL REFERENCES users(id),
  paid_to         INTEGER NOT NULL REFERENCES users(id),
  amount          REAL NOT NULL,
  settlement_date TEXT NOT NULL,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- Import reports: audit log of every CSV import
CREATE TABLE import_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  import_date TEXT DEFAULT (datetime('now')),
  group_id    INTEGER,
  filename    TEXT,
  total_rows  INTEGER,
  imported    INTEGER,
  skipped     INTEGER,
  flagged     INTEGER,
  report_json TEXT    -- full JSON with every anomaly detail
);
```

### Key Design Decisions in Schema

1. **`amount` + `amount_inr` + `exchange_rate`:** We store both the original amount and the INR-converted amount. This allows us to display "$45" to the user while doing all balance math in a single currency (INR).

2. **`group_members.joined_at` / `left_at`:** This directly implements the "Sam joined mid-April, Meera left end of March" requirement. Every expense split query filters by `joined_at <= expense_date < left_at`.

3. **`expense_splits` table:** Rather than computing splits on-the-fly, we persist every split at write time. This means Rohan can always trace "which expenses make up my ₹2,300" — just query `expense_splits WHERE user_id = rohan.id`.

4. **`is_settlement` flag on expenses:** Settlements detected in the CSV are stored in the `expenses` table with `is_settlement = 1` (or in the `settlements` table when manually recorded). Balance queries exclude `is_settlement = 1` expenses.

5. **`import_row`:** Every imported expense stores the original CSV row number. This allows live-session tracing: "Show me what happened to row 44" → query `expenses WHERE import_row = 44`.
