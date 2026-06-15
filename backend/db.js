// Database using @libsql/client (pure JS/WASM SQLite - no native build required)
const { createClient } = require('@libsql/client');
const path = require('path');

const db = createClient({
  url: `file:${path.join(__dirname, 'expenses.db')}`
});

// Synchronous-style wrapper for easier use
// Since @libsql/client is async, we'll use a sync wrapper pattern via a cache
// We expose a query helper used in routes

async function initDB() {
  await db.execute(`PRAGMA journal_mode = WAL`);
  await db.execute(`PRAGMA foreign_keys = ON`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS groups_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL,
      left_at TEXT,
      FOREIGN KEY (group_id) REFERENCES groups_table(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      amount_inr REAL NOT NULL,
      exchange_rate REAL DEFAULT 1.0,
      paid_by INTEGER NOT NULL,
      split_type TEXT NOT NULL,
      expense_date TEXT NOT NULL,
      category TEXT,
      notes TEXT,
      is_settlement INTEGER DEFAULT 0,
      import_row INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (group_id) REFERENCES groups_table(id),
      FOREIGN KEY (paid_by) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      amount_owed REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      paid_by INTEGER NOT NULL,
      paid_to INTEGER NOT NULL,
      amount REAL NOT NULL,
      settlement_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (group_id) REFERENCES groups_table(id),
      FOREIGN KEY (paid_by) REFERENCES users(id),
      FOREIGN KEY (paid_to) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS import_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_date TEXT DEFAULT (datetime('now')),
      group_id INTEGER,
      filename TEXT,
      total_rows INTEGER,
      imported INTEGER,
      skipped INTEGER,
      flagged INTEGER,
      report_json TEXT
    )
  `);

  console.log('Database initialized successfully');
}

// Helper: run a query and return all rows
async function query(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows;
}

// Helper: run a query and return first row
async function queryOne(sql, args = []) {
  const rows = await query(sql, args);
  return rows[0] || null;
}

// Helper: run an insert/update/delete and return lastInsertRowid
async function run(sql, args = []) {
  const result = await db.execute({ sql, args });
  return { lastInsertRowid: result.lastInsertRowid, rowsAffected: result.rowsAffected };
}

// Helper: run multiple statements in a transaction
async function transaction(fn) {
  await db.execute('BEGIN');
  try {
    const result = await fn({ query, queryOne, run });
    await db.execute('COMMIT');
    return result;
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

module.exports = { db, initDB, query, queryOne, run, transaction };
