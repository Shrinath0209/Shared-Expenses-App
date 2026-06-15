const express = require('express');
const { query, queryOne, run, transaction } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get active members for a group at a given date
async function getActiveMembersAtDate(groupId, date) {
  return await query(`
    SELECT u.id, u.name
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
      AND gm.joined_at <= ?
      AND (gm.left_at IS NULL OR gm.left_at > ?)
  `, [groupId, date, date]);
}

// Create splits
async function createSplits(expenseId, splitType, totalAmountINR, splits, members) {
  if (splitType === 'equal') {
    if (members.length === 0) return;
    const perPerson = Math.round((totalAmountINR / members.length) * 100) / 100;
    let remainder = Math.round((totalAmountINR - perPerson * members.length) * 100) / 100;
    for (let i = 0; i < members.length; i++) {
      const amt = i === 0 ? perPerson + remainder : perPerson;
      await run('INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES (?, ?, ?)', [expenseId, members[i].id, amt]);
    }
  } else if (splitType === 'exact') {
    for (const s of splits) {
      await run('INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES (?, ?, ?)', [expenseId, s.user_id, s.amount]);
    }
  } else if (splitType === 'percentage') {
    for (const s of splits) {
      const amt = Math.round((totalAmountINR * s.percentage / 100) * 100) / 100;
      await run('INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES (?, ?, ?)', [expenseId, s.user_id, amt]);
    }
  } else if (splitType === 'shares') {
    const totalShares = splits.reduce((sum, s) => sum + s.shares, 0);
    for (const s of splits) {
      const amt = Math.round((totalAmountINR * s.shares / totalShares) * 100) / 100;
      await run('INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES (?, ?, ?)', [expenseId, s.user_id, amt]);
    }
  }
}

// Create expense
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      group_id, description, amount, currency = 'INR',
      exchange_rate = 1.0, paid_by, split_type = 'equal',
      expense_date, category, notes, splits
    } = req.body;

    if (!group_id || !description || !amount || !paid_by || !expense_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const amount_inr = amount * exchange_rate;

    const result = await run(`
      INSERT INTO expenses (group_id, description, amount, currency, amount_inr, exchange_rate, paid_by, split_type, expense_date, category, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [group_id, description, amount, currency, amount_inr, exchange_rate, paid_by, split_type, expense_date, category || null, notes || null]);

    const expenseId = Number(result.lastInsertRowid);
    const members = await getActiveMembersAtDate(group_id, expense_date);

    if (split_type === 'equal') {
      await createSplits(expenseId, 'equal', amount_inr, null, members);
    } else {
      await createSplits(expenseId, split_type, amount_inr, splits, members);
    }

    res.json({ id: expenseId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get expenses for a group
router.get('/group/:groupId', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 100, search = '' } = req.query;
    const offset = (page - 1) * limit;

    const expenses = await query(`
      SELECT e.*, u.name as paid_by_name
      FROM expenses e
      JOIN users u ON u.id = e.paid_by
      WHERE e.group_id = ? AND (e.description LIKE ? OR u.name LIKE ?)
      ORDER BY e.expense_date DESC, e.id DESC
      LIMIT ? OFFSET ?
    `, [req.params.groupId, `%${search}%`, `%${search}%`, limit, offset]);

    // Fetch splits for each expense
    const result = [];
    for (const exp of expenses) {
      const splits = await query(`
        SELECT es.*, u.name as user_name FROM expense_splits es 
        JOIN users u ON u.id = es.user_id WHERE es.expense_id = ?
      `, [exp.id]);
      result.push({ ...exp, splits });
    }

    const totalRow = await queryOne('SELECT COUNT(*) as cnt FROM expenses WHERE group_id = ?', [req.params.groupId]);
    res.json({ expenses: result, total: Number(totalRow?.cnt || 0) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single expense
router.get('/:id', authenticate, async (req, res) => {
  try {
    const expense = await queryOne(`
      SELECT e.*, u.name as paid_by_name FROM expenses e 
      JOIN users u ON u.id = e.paid_by WHERE e.id = ?
    `, [req.params.id]);
    if (!expense) return res.status(404).json({ error: 'Not found' });

    const splits = await query(`
      SELECT es.*, u.name as user_name FROM expense_splits es 
      JOIN users u ON u.id = es.user_id WHERE es.expense_id = ?
    `, [req.params.id]);

    res.json({ ...expense, splits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update expense
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { description, amount, currency = 'INR', exchange_rate = 1.0, paid_by, split_type, expense_date, category, notes, splits } = req.body;
    const amount_inr = amount * exchange_rate;

    await run(`
      UPDATE expenses SET description=?, amount=?, currency=?, amount_inr=?, exchange_rate=?,
      paid_by=?, split_type=?, expense_date=?, category=?, notes=? WHERE id=?
    `, [description, amount, currency, amount_inr, exchange_rate, paid_by, split_type, expense_date, category, notes, req.params.id]);

    await run('DELETE FROM expense_splits WHERE expense_id = ?', [req.params.id]);
    const expense = await queryOne('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    const members = await getActiveMembersAtDate(expense.group_id, expense_date);
    await createSplits(req.params.id, split_type, amount_inr, splits, members);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete expense
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await run('DELETE FROM expense_splits WHERE expense_id = ?', [req.params.id]);
    await run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.getActiveMembersAtDate = getActiveMembersAtDate;
module.exports.createSplits = createSplits;
