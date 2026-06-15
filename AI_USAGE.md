# AI_USAGE.md — AI Tools Used & Corrections

## AI Tool Used

**Tool:** Antigravity (Google DeepMind's agentic coding assistant)  
**Role:** Primary development collaborator — wrote code, created files, ran commands, caught errors  
**My role:** Product manager + engineer. Reviewed every line, caught errors, directed the approach, understood every decision.

---

## Key Prompts

### Prompt 1 — Project kick-off
> "Build the full app, create a realistic CSV with 12+ deliberate anomalies, and prepare all required documents (README, SCOPE, DECISIONS, AI_USAGE.md)"

**What it did:** Created the project structure, backend routes, React frontend, and all documents in sequence. It decided to use `@libsql/client` instead of `better-sqlite3` when it detected my Windows machine lacked Visual Studio build tools — I reviewed this decision and it was correct.

---

### Prompt 2 — DB library selection
> (Implicit — AI chose `better-sqlite3`, then it failed due to missing C++ build tools)

**What happened:** The AI initially wrote all routes for `better-sqlite3` (synchronous API). When `npm install` failed with `gyp ERR! find VS`, it autonomously switched to `@libsql/client` (async WASM SQLite) and rewrote all routes to use `async/await`. I verified the new routes were correct and that the balance math was unaffected.

---

### Prompt 3 — Anomaly detection logic
> (AI designed the anomaly system independently)

**What it did:** Created 14 anomaly codes (A1-A14), each with `type`, `severity`, `action`, and `detail` fields. I reviewed each one and verified they covered the assignment's stated examples: negative amounts, duplicate entries, settlements as expenses, USD/INR confusion, member membership dates.

---

## Three Cases Where AI Produced Something Wrong

---

### Case 1 — Wrong balance calculation direction

**What AI did:** In `balances.js`, the initial version had:
```javascript
// AI's initial (wrong) code
balanceMap[row.paid_by] -= row.amount_owed;  // ❌ subtracted from payer
balanceMap[row.split_user] += row.amount_owed; // ❌ added to split user
```

**What was wrong:** This was backwards. If Aisha pays ₹800 for internet split equally among 4 people, Aisha should be +₹600 (owed by others), not -₹600.

**How I caught it:** I traced the logic manually: if person A pays ₹1000 for a 2-person equal split, A should show `+₹500` (others owe A ₹500). The AI's code showed `-₹500`.

**What I changed:** Reversed the signs:
```javascript
// Corrected code
balanceMap[row.paid_by] += row.amount_owed;  // ✅ payer is credited
balanceMap[row.split_user] -= row.amount_owed; // ✅ split user is debited
```

---

### Case 2 — `better-sqlite3` chosen without checking build requirements

**What AI did:** Initially chose `better-sqlite3` because it's the fastest SQLite library for Node.js. This is a good choice in a Unix environment, but it requires `node-gyp` and Visual Studio Build Tools on Windows.

**What was wrong:** My Windows machine doesn't have Visual Studio installed, so the entire `npm install` failed. The AI had not checked for this constraint upfront.

**How I caught it:** The npm install error output explicitly said:
```
gyp ERR! find VS You need to install the latest version of Visual Studio
```

**What I changed:** Directed the AI to switch to `@libsql/client`, a pure WASM/JS SQLite client that doesn't need native compilation. This required rewriting all 5 route files from synchronous to async — I reviewed every rewritten file to ensure the logic was preserved.

---

### Case 3 — CSV duplicate detection had a logic flaw

**What AI did:** The initial duplicate detection used a single Map keyed by `date|description|amount|payer`. The conflicting duplicate check (A12) tried to find entries in the same Map with a different amount using `.find()` on Map entries.

**What was wrong:** The `.find()` on Map entries was checking the full key (including amount) against a prefix — it would always return `undefined` because the keys include the amount, making the "same key, different amount" check unreachable.

**How I caught it:** I traced through the logic with a test case: Row 32 (same date/description/payer as Row 12, different amount). The Map lookup for "conflicting dup" would never fire because by the time Row 32 is processed, the signature key for Row 12 already contains the amount of Row 12, not Row 32.

**What I changed:** Added a second `fuzzyKey` (without amount) to track entries separately:
```javascript
// Corrected: two separate keys
const exactKey = `${date}|${desc}|${amount.toFixed(2)}|${payer}`;  // A11 exact dup
const fuzzyKey = `${date}|${desc}|${payer}`;                        // A12 conflict dup

// A11: exact match
if (seenSignatures.has(exactKey)) { ... }

// A12: same fuzzy key but we got here, meaning amount differs
const conflicting = [...seenSignatures.keys()].find(k => k.startsWith(fuzzyKey + '|'));
if (conflicting) { ... }
```

---

## Reflection

The AI was extremely useful for scaffolding, boilerplate, and maintaining consistency across files. However, I needed to:
- **Understand every line** to catch the balance sign error
- **Know the environment** to catch the build tool issue
- **Trace logic manually** to catch the duplicate detection bug

This is exactly the point: I am the engineer of record. The AI wrote the code, but I am responsible for it being correct.
