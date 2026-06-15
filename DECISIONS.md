# DECISIONS.md — Engineering & Product Decision Log

Every significant decision made while building this app, options considered, and rationale.

---

## D1 — Database: SQLite via @libsql/client

**Decision:** Use SQLite with `@libsql/client` (WASM-based, no native compilation).

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| `better-sqlite3` | Synchronous API, fastest | Requires Visual Studio C++ on Windows (not available on this machine) |
| `sqlite3` (node-sqlite3) | Common, well-documented | Also requires native compilation |
| `@libsql/client` | Pure JS/WASM, no build tools, async API | Slightly more complex async code |
| PostgreSQL | Production-grade, full SQL | Overkill for a flat-sharing app, requires separate service |
| MongoDB | Flexible schema | Assignment explicitly says "relational DBs only" |

**Chose:** `@libsql/client` — satisfies the "relational DB" requirement, works without Visual Studio, and SQLite is perfectly appropriate for this data volume.

---

## D2 — Balance Calculation: Store Splits at Write Time

**Decision:** Persist `expense_splits` rows immediately when an expense is created, rather than computing splits dynamically on every balance query.

**Options considered:**
- **Compute on-the-fly:** Every balance query re-calculates splits from expense metadata. Simpler schema, but harder to audit and slower for large datasets.
- **Store splits:** One `expense_splits` row per person per expense. Slightly more storage, but enables Rohan's requirement: "If the app says I owe ₹2,300, I want to see exactly which expenses make that up."

**Chose:** Store splits. The per-person trace is a core product requirement, not a nice-to-have. You can literally `SELECT * FROM expense_splits WHERE user_id = ?` to answer "what makes up my balance."

---

## D3 — Membership Dates: `joined_at` / `left_at` on `group_members`

**Decision:** Track when each person joined and left the group using ISO date columns, not just a boolean `is_active`.

**Options considered:**
- **Boolean `is_active`:** Simple, but loses history. Can't answer "was Meera in the group on 28 March?"
- **`joined_at` + `left_at`:** Slightly more complex queries, but enables time-aware splits: `WHERE joined_at <= expense_date AND (left_at IS NULL OR left_at > expense_date)`.

**Chose:** `joined_at` + `left_at`. This directly solves Sam's requirement and the Meera edge case. Any expense query can ask "who was active on this date?" as a simple range check.

**Implementation:** Meera has `left_at = '2026-03-31'`. Sam has `joined_at = '2026-04-15'`. Any expense dated `2026-04-01` to `2026-04-14` splits only among Aisha, Rohan, Priya.

---

## D4 — Duplicate Detection: Composite Key vs Hash

**Decision:** Detect duplicates using a composite string key: `date|description.lowercase|amount.toFixed(2)|payerName`.

**Options considered:**
- **Hash entire row:** Detects exact duplicates only. Misses conflicting duplicates (same event, different amounts).
- **Composite key (date + description + payer):** Catches both exact duplicates (same amount = A11) and conflicting duplicates (different amount = A12).
- **Fuzzy matching (Levenshtein):** Could catch typos, but adds significant complexity and false positives.

**Chose:** Composite key — precise enough to catch the actual problems in this CSV, simple enough to be auditable.

---

## D5 — Conflicting Duplicate Policy: Keep First, Skip Second

**Decision:** When two rows have the same date/description/payer but different amounts (A12), keep the first row and skip the second.

**Options considered:**
- **Keep higher amount:** Might over-inflate expenses.
- **Keep lower amount:** Might under-count.
- **Keep first, flag second (chosen):** Deterministic, auditable, surfaces the conflict to the user without guessing.
- **Skip both, require manual entry:** Too aggressive; discards potentially valid data.
- **Ask user interactively:** The assignment's preview/execute flow allows this — the user sees the anomaly report before confirming import.

**Chose:** Keep first, flag second. The import report shows both rows and their amounts, so the user can manually correct if needed.

---

## D6 — USD/INR Exchange Rate: Fixed vs Live

**Decision:** Use a **fixed rate of ₹83.50 per USD** rather than a live API call.

**Options considered:**
- **Live rate via API:** Accurate, but introduces external dependency, network failure risk, and rate limits.
- **Fixed historical rate:** Deterministic, reproducible. The trip was in April 2026; ₹83.50 is an accurate approximation for that period.
- **Let user input rate:** Maximally accurate, but adds friction to the import flow.

**Chose:** Fixed rate, documented in `SCOPE.md`. The rate is stored per-expense in the `exchange_rate` column, so it can be corrected by editing the expense.

---

## D7 — Negative Amount Policy: Refund, Not Error

**Decision:** Treat negative amounts as refunds (flip to positive, flag as refund).

**Options considered:**
- **Skip as error:** Too aggressive. A refund entry in a spreadsheet is a valid accounting event.
- **Import as-is (negative):** Would confuse balance math — a negative expense would make the payer appear to owe more.
- **Treat as refund (chosen):** Flip to positive, record `is_refund` note. This keeps the balance math consistent while preserving the intent.

**Chose:** Refund treatment. The row in `expenses_export.csv` with `-1500` is clearly a refund (Aisha being credited back), not a data entry error.

---

## D8 — Settlement Detection: Keyword Scanning

**Decision:** Detect settlements by scanning the description for keywords like `settlement`, `paid back`, `payment to`.

**Options considered:**
- **Separate CSV column:** Would require a well-structured CSV. This one isn't.
- **Manual flagging by user:** Puts burden on user post-import.
- **Keyword scanning (chosen):** Catches the obvious cases automatically. Edge cases are surfaced as anomalies for user review.

**Chose:** Keyword scanning with `is_settlement = 1` flag. The import report shows which rows were auto-classified as settlements so the user can override.

---

## D9 — Debt Simplification Algorithm

**Decision:** Use a greedy debt-simplification algorithm (minimum number of transactions).

**How it works:**
1. Compute net balance per person: `net = total_paid - total_owed`
2. Sort into creditors (net > 0) and debtors (net < 0)
3. Greedily match largest debtor with largest creditor, creating a transaction for `min(credit, debt)`
4. Repeat until all balanced

**Why this matters:** Without simplification, 4 people might need 6 transactions. With simplification, usually 3 or fewer. This answers Aisha's requirement: "I just want one number per person."

**Code location:** `backend/routes/balances.js` → `simplifyDebts()`

---

## D10 — Sam's Membership Date: CSV vs Reality

**Decision:** In the CSV, row 17 includes Sam in a split for `05/04/2026`, but Sam's `joined_at` is `2026-04-15`. This is anomaly A13.

**Options considered:**
- **Use the CSV split list as-is:** Would incorrectly include Sam in pre-joining expenses.
- **Always use active members at expense date (chosen):** Compute the correct split members from `joined_at`/`left_at` even if the CSV says otherwise.

**Policy:** If a split member is listed but was not active on that date, exclude them and recalculate the split among those who were active. This directly implements Sam's requirement.

---

## D11 — Frontend Framework: Vite + React

**Decision:** Use Vite + React for the frontend.

**Rationale:** Fast HMR, no config, React's component model maps cleanly to the app's views (groups → expenses → balances). Could have used plain HTML/JS but React's state management makes the modal-heavy UX much cleaner.

---

## D12 — Authentication: JWT vs Session

**Decision:** JWT stored in `localStorage`, verified via middleware on every API request.

**Options considered:**
- **Session (server-side):** Requires session store, more complex.
- **JWT in httpOnly cookie:** More secure against XSS, but requires CORS cookie config.
- **JWT in localStorage (chosen):** Simpler, works in all environments, acceptable for a demo/assignment context.

**Note for production:** Would switch to httpOnly cookie + refresh token rotation.
