const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { query, queryOne, run } = require('../db');
const { authenticate } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) cb(null, true);
    else cb(new Error('Only CSV files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// USD to INR exchange rate used for the trip
const USD_TO_INR = 83.5;

// Known members with join/leave dates
const KNOWN_MEMBERS = {
  'aisha': { joined: '2026-02-01', left: null, canonical: 'Aisha' },
  'rohan': { joined: '2026-02-01', left: null, canonical: 'Rohan' },
  'priya': { joined: '2026-02-01', left: null, canonical: 'Priya' },
  'meera': { joined: '2026-02-01', left: '2026-03-31', canonical: 'Meera' },
  'dev':   { joined: '2026-04-15', left: null, canonical: 'Dev' },
  'sam':   { joined: '2026-04-15', left: null, canonical: 'Sam' }
};

function normalizeName(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const nameMap = {
    'aisha': 'Aisha', 'ayesha': 'Aisha',
    'rohan': 'Rohan', 'rohit': 'Rohan',
    'priya': 'Priya', 'priyanka': 'Priya',
    'meera': 'Meera', 'mira': 'Meera',
    'dev': 'Dev', 'devansh': 'Dev',
    'sam': 'Sam', 'samuel': 'Sam', 'samira': 'Sam'
  };
  return nameMap[n] || null;
}

function parseAmount(raw) {
  if (!raw) return { value: null, currency: 'INR', error: 'Missing amount' };
  const s = String(raw).trim();
  let currency = 'INR';
  let str = s;

  if (str.includes('$')) { currency = 'USD'; str = str.replace('$', ''); }
  else { str = str.replace(/₹|Rs\.?|rs\.?/gi, ''); }

  str = str.replace(/,/g, '').replace(/\s/g, '');
  const value = parseFloat(str);
  if (isNaN(value)) return { value: null, currency, error: `Cannot parse amount: "${raw}"` };
  return { value, currency, error: null };
}

function parseDate(raw) {
  if (!raw) return { date: null, error: 'Missing date' };
  const s = String(raw).trim();

  const formats = [
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, fn: m => `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` },
    { regex: /^(\d{4})-(\d{2})-(\d{2})$/, fn: m => m[0] },
    { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, fn: m => `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` },
    { regex: /^(\d{1,2})\/([A-Za-z]+)\/(\d{4})$/i, fn: m => {
      const mo = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }[m[2].toLowerCase().substring(0,3)];
      return mo ? `${m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}` : null;
    }},
    { regex: /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/, fn: m => {
      const mo = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }[m[2].toLowerCase().substring(0,3)];
      return mo ? `${m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}` : null;
    }}
  ];

  for (const f of formats) {
    const match = s.match(f.regex);
    if (match) {
      const result = f.fn(match);
      if (result) {
        const d = new Date(result);
        if (!isNaN(d.getTime())) {
          // Validate day is real (catches April 31, etc.)
          const [y, mo, day] = result.split('-').map(Number);
          const check = new Date(y, mo - 1, day);
          if (check.getDate() === day && check.getMonth() === mo - 1) return { date: result, error: null };
          return { date: null, error: `Invalid calendar date: "${raw}" (day ${day} doesn't exist in month ${mo})` };
        }
      }
    }
  }

  return { date: null, error: `Cannot parse date: "${raw}"` };
}

function isMemberActive(memberName, date) {
  const key = memberName.toLowerCase();
  const info = KNOWN_MEMBERS[key];
  if (!info) return { active: false, reason: `Unknown member: ${memberName}` };
  if (date < info.joined) return { active: false, reason: `${memberName} had not joined by ${date} (joined ${info.joined})` };
  if (info.left && date > info.left) return { active: false, reason: `${memberName} had left by ${date} (left ${info.left})` };
  return { active: true, reason: null };
}

// Core CSV processing logic (pure function, testable)
function processCSV(csvText) {
  const anomalies = [];
  const toImport = [];
  const skipped = [];

  let records;
  try {
    records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, bom: true });
  } catch (e) {
    throw new Error(`CSV parse error: ${e.message}`);
  }

  const seenSignatures = new Map();

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2;
    const rawRow = records[i];
    // Normalize keys to lowercase
    const r = {};
    for (const [k, v] of Object.entries(rawRow)) r[k.trim().toLowerCase()] = v;

    const rowAnomalies = [];
    let skip = false;

    // A1: Parse description
    const description = (r['description'] || r['expense'] || r['name'] || r['item'] || '').trim();
    if (!description) {
      rowAnomalies.push({ code: 'A1', type: 'MISSING_DESCRIPTION', severity: 'warning', action: 'USE_DEFAULT', detail: `Row ${rowNum}: No description found — using "Unknown Expense"` });
    }

    // A2: Parse amount
    const rawAmount = r['amount'] || r['total'] || r['cost'] || '';
    const { value: amount, currency, error: amountError } = parseAmount(rawAmount);
    if (amountError) {
      rowAnomalies.push({ code: 'A2', type: 'INVALID_AMOUNT', severity: 'error', action: 'SKIP_ROW', detail: `Row ${rowNum}: ${amountError}` });
      skip = true;
    }

    // A3: Zero amount
    if (!skip && amount === 0) {
      rowAnomalies.push({ code: 'A3', type: 'ZERO_AMOUNT', severity: 'warning', action: 'SKIP_ROW', detail: `Row ${rowNum}: Zero amount — not a meaningful expense` });
      skip = true;
    }

    // A4: Negative amount (treat as refund)
    let finalAmount = amount;
    let isRefund = false;
    if (!skip && amount !== null && amount < 0) {
      isRefund = true;
      finalAmount = Math.abs(amount);
      rowAnomalies.push({ code: 'A4', type: 'NEGATIVE_AMOUNT', severity: 'warning', action: 'TREAT_AS_REFUND', detail: `Row ${rowNum}: Negative amount ${rawAmount} — recording as refund (positive ₹${finalAmount})` });
    }

    // A5: Currency conversion
    let amountINR = finalAmount;
    let exchangeRate = 1.0;
    if (!skip && currency === 'USD' && finalAmount !== null) {
      exchangeRate = USD_TO_INR;
      amountINR = finalAmount * USD_TO_INR;
      rowAnomalies.push({ code: 'A5', type: 'CURRENCY_CONVERSION', severity: 'info', action: 'CONVERT_USD_INR', detail: `Row ${rowNum}: $${finalAmount} → ₹${amountINR.toFixed(2)} at rate ${USD_TO_INR}` });
    }

    // A6: Parse date
    const rawDate = r['date'] || r['expense_date'] || r['when'] || '';
    const { date, error: dateError } = parseDate(rawDate);
    if (dateError) {
      rowAnomalies.push({ code: 'A6', type: 'INVALID_DATE', severity: 'error', action: 'SKIP_ROW', detail: `Row ${rowNum}: ${dateError}` });
      skip = true;
    }

    // A7: Future date
    if (!skip && date) {
      const today = new Date().toISOString().split('T')[0];
      if (date > today) {
        rowAnomalies.push({ code: 'A7', type: 'FUTURE_DATE', severity: 'warning', action: 'IMPORT_FLAGGED', detail: `Row ${rowNum}: Expense date ${date} is in the future — imported but flagged` });
      }
    }

    // A8: Parse paid_by
    const rawPaidBy = r['paid_by'] || r['paidby'] || r['paid by'] || r['who_paid'] || '';
    const paidByName = normalizeName(rawPaidBy);
    if (!paidByName) {
      rowAnomalies.push({ code: 'A8', type: 'UNKNOWN_OR_MISSING_PAYER', severity: 'error', action: 'SKIP_ROW', detail: `Row ${rowNum}: Cannot identify payer "${rawPaidBy}"` });
      skip = true;
    }

    // A9: Payer was not active on expense date
    if (!skip && paidByName && date) {
      const activity = isMemberActive(paidByName, date);
      if (!activity.active) {
        rowAnomalies.push({ code: 'A9', type: 'PAYER_NOT_ACTIVE', severity: 'warning', action: 'IMPORT_FLAGGED', detail: `Row ${rowNum}: ${activity.reason} — imported but flagged for review` });
      }
    }

    // A10: Settlement logged as expense
    const descLower = (description || '').toLowerCase();
    const isSettlementKeyword = descLower.includes('settlement') || descLower.includes('paid back') || descLower.includes('payment to') || (descLower.includes('settl'));
    if (!skip && isSettlementKeyword) {
      rowAnomalies.push({ code: 'A10', type: 'SETTLEMENT_AS_EXPENSE', severity: 'warning', action: 'MARK_AS_SETTLEMENT', detail: `Row ${rowNum}: "${description}" appears to be a settlement/payment, not an expense — will be marked as settlement` });
    }

    // A11: Exact duplicate detection
    if (!skip && finalAmount !== null && date && paidByName) {
      const sig = `${date}|${(description || '').toLowerCase()}|${finalAmount.toFixed(2)}|${paidByName}`;
      if (seenSignatures.has(sig)) {
        const prev = seenSignatures.get(sig);
        rowAnomalies.push({ code: 'A11', type: 'EXACT_DUPLICATE', severity: 'error', action: 'SKIP_ROW', detail: `Row ${rowNum}: Exact duplicate of row ${prev.rowNum} (same date, description, amount, payer) — skipping` });
        skip = true;
      } else {
        seenSignatures.set(sig, { rowNum, amount: finalAmount });
      }
    }

    // A12: Conflicting duplicate (same key but different amount)
    if (!skip && finalAmount !== null && date && paidByName) {
      const fuzzyKey = `${date}|${(description || '').toLowerCase()}|${paidByName}`;
      const existing = [...seenSignatures.entries()].find(([k]) => k.startsWith(fuzzyKey + '|') && k !== `${fuzzyKey}|${finalAmount.toFixed(2)}`);
      if (existing) {
        const prev = existing[1];
        rowAnomalies.push({ code: 'A12', type: 'CONFLICTING_DUPLICATE', severity: 'warning', action: 'SKIP_ROW', detail: `Row ${rowNum}: Same description/date/payer as row ${prev.rowNum} but different amount — keeping first entry, skipping this one` });
        skip = true;
      }
    }

    // A13: Parse split members and validate
    const rawSplitWith = r['split_with'] || r['split with'] || r['members'] || '';
    let splitMemberList = [];
    if (rawSplitWith) {
      const names = rawSplitWith.split(/[,;|]/).map(s => normalizeName(s.trim())).filter(Boolean);
      for (const m of names) {
        if (date) {
          const activity = isMemberActive(m, date);
          if (!activity.active) {
            rowAnomalies.push({ code: 'A13', type: 'INACTIVE_SPLIT_MEMBER', severity: 'warning', action: 'EXCLUDE_FROM_SPLIT', detail: `Row ${rowNum}: ${activity.reason} — excluding ${m} from split` });
          } else {
            splitMemberList.push(m);
          }
        } else {
          splitMemberList.push(m);
        }
      }
    }

    // A14: Split type normalization
    const rawSplitType = (r['split_type'] || r['split type'] || r['splittype'] || 'equal').trim().toLowerCase();
    const splitTypeMap = { 'equal': 'equal', 'equally': 'equal', 'exact': 'exact', 'fixed': 'exact',
      'percentage': 'percentage', 'percent': 'percentage', '%': 'percentage',
      'shares': 'shares', 'ratio': 'shares', 'custom': 'shares' };
    const splitType = splitTypeMap[rawSplitType] || 'equal';
    if (!splitTypeMap[rawSplitType] && rawSplitType && rawSplitType !== 'equal') {
      rowAnomalies.push({ code: 'A14', type: 'UNKNOWN_SPLIT_TYPE', severity: 'warning', action: 'DEFAULT_TO_EQUAL', detail: `Row ${rowNum}: Unknown split type "${rawSplitType}" — defaulting to equal` });
    }

    if (rowAnomalies.length > 0) anomalies.push({ rowNum, anomalies: rowAnomalies });

    if (skip) {
      skipped.push({ rowNum, description: description || '(blank)', reasons: rowAnomalies.filter(a => a.action === 'SKIP_ROW').map(a => a.detail).join('; ') });
      continue;
    }

    toImport.push({
      rowNum, description: description || 'Unknown Expense',
      amount: finalAmount, currency, amountINR: amountINR !== undefined ? amountINR : finalAmount,
      exchangeRate, date, paidByName, splitType, splitMemberList,
      isSettlement: isSettlementKeyword, isRefund,
      category: r['category'] || null, notes: r['notes'] || r['note'] || null
    });
  }

  return { records: toImport, anomalies, skipped, totalRows: records.length };
}

// Preview endpoint (dry run, no DB writes)
router.post('/preview', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const csvText = fs.readFileSync(req.file.path, 'utf-8');
    fs.unlinkSync(req.file.path);
    const result = processCSV(csvText);
    res.json({
      totalRows: result.totalRows,
      willImport: result.records.length,
      willSkip: result.skipped.length,
      anomalyCount: result.anomalies.length,
      anomalies: result.anomalies,
      skipped: result.skipped,
      preview: result.records.slice(0, 20)
    });
  } catch (e) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e.message });
  }
});

// Execute import
router.post('/execute', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const groupId = req.body.group_id;
  if (!groupId) return res.status(400).json({ error: 'group_id is required' });

  try {
    const csvText = fs.readFileSync(req.file.path, 'utf-8');
    fs.unlinkSync(req.file.path);

    const { records, anomalies, skipped, totalRows } = processCSV(csvText);

    // Ensure all flatmates exist in DB and in group
    const memberNames = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Dev', 'Sam'];
    const userIdMap = {};

    for (const name of memberNames) {
      let user = await queryOne('SELECT id FROM users WHERE name = ?', [name]);
      if (!user) {
        const result = await run(
          'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
          [name, `${name.toLowerCase()}@flatmates.com`, '$2a$10$placeholder']
        );
        user = { id: result.lastInsertRowid };
      }
      userIdMap[name] = Number(user.id);

      // Add to group if not already there
      const info = KNOWN_MEMBERS[name.toLowerCase()];
      if (info) {
        const existing = await queryOne(
          'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
          [groupId, userIdMap[name]]
        );
        if (!existing) {
          await run(
            'INSERT INTO group_members (group_id, user_id, joined_at, left_at) VALUES (?, ?, ?, ?)',
            [groupId, userIdMap[name], info.joined, info.left || null]
          );
        }
      }
    }

    // Import records
    let importedCount = 0;
    const importLog = [];

    for (const rec of records) {
      const paidById = userIdMap[rec.paidByName];
      if (!paidById) {
        importLog.push({ rowNum: rec.rowNum, status: 'skipped', reason: `Unknown payer: ${rec.paidByName}` });
        continue;
      }

      // Determine split members from either split_with column or active members at date
      let splitMembers;
      if (rec.splitMemberList.length > 0) {
        splitMembers = rec.splitMemberList.map(n => ({ id: userIdMap[n], name: n })).filter(m => m.id);
      } else {
        // Get all active members at expense date
        splitMembers = Object.entries(KNOWN_MEMBERS)
          .filter(([name, info]) => rec.date >= info.joined && (info.left === null || rec.date <= info.left))
          .map(([name, info]) => ({ id: userIdMap[info.canonical], name: info.canonical }))
          .filter(m => m.id);
      }

      if (splitMembers.length === 0) {
        importLog.push({ rowNum: rec.rowNum, status: 'skipped', reason: 'No valid split members at expense date' });
        continue;
      }

      try {
        const expResult = await run(`
          INSERT INTO expenses (group_id, description, amount, currency, amount_inr, exchange_rate,
            paid_by, split_type, expense_date, category, notes, is_settlement, import_row)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          groupId, rec.description, rec.amount, rec.currency,
          rec.amountINR, rec.exchangeRate, paidById,
          rec.splitType, rec.date, rec.category, rec.notes,
          rec.isSettlement ? 1 : 0, rec.rowNum
        ]);

        const expId = Number(expResult.lastInsertRowid);

        // Equal split with penny rounding
        const perPerson = Math.round((rec.amountINR / splitMembers.length) * 100) / 100;
        let remainder = Math.round((rec.amountINR - perPerson * splitMembers.length) * 100) / 100;

        for (let idx = 0; idx < splitMembers.length; idx++) {
          const amt = idx === 0 ? perPerson + remainder : perPerson;
          await run('INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES (?, ?, ?)', [expId, splitMembers[idx].id, amt]);
        }

        importedCount++;
        importLog.push({ rowNum: rec.rowNum, status: 'imported', expenseId: expId, description: rec.description, amount: rec.amountINR });
      } catch (e) {
        importLog.push({ rowNum: rec.rowNum, status: 'error', reason: e.message });
      }
    }

    // Save report
    const reportData = JSON.stringify({ anomalies, skipped, importLog });
    const reportResult = await run(`
      INSERT INTO import_reports (group_id, filename, total_rows, imported, skipped, flagged, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [groupId, 'expenses_export.csv', totalRows, importedCount, skipped.length, anomalies.length, reportData]);

    res.json({
      success: true, totalRows, imported: importedCount,
      skipped: skipped.length, anomalyCount: anomalies.length,
      reportId: Number(reportResult.lastInsertRowid),
      anomalies, skipped, importLog
    });
  } catch (e) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e.message });
  }
});

// List reports
router.get('/reports', authenticate, async (req, res) => {
  try {
    const reports = await query('SELECT * FROM import_reports ORDER BY import_date DESC');
    res.json(reports.map(r => ({ ...r, report_json: JSON.parse(r.report_json || '{}') })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Single report
router.get('/reports/:id', authenticate, async (req, res) => {
  try {
    const report = await queryOne('SELECT * FROM import_reports WHERE id = ?', [req.params.id]);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ ...report, report_json: JSON.parse(report.report_json || '{}') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
