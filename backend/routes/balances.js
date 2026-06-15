const express = require('express');
const { query, queryOne, run } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get balances for a group
router.get('/group/:groupId', authenticate, async (req, res) => {
  try {
    const groupId = req.params.groupId;

    const expenses = await query(`
      SELECT e.id, e.paid_by, e.amount_inr, e.expense_date, e.description, e.is_settlement,
        es.user_id as split_user, es.amount_owed
      FROM expenses e
      JOIN expense_splits es ON es.expense_id = e.id
      WHERE e.group_id = ? AND e.is_settlement = 0
    `, [groupId]);

    const settlements = await query('SELECT * FROM settlements WHERE group_id = ?', [groupId]);

    // Build balance map
    const balanceMap = {};

    for (const row of expenses) {
      const paidBy = Number(row.paid_by);
      const splitUser = Number(row.split_user);
      if (!balanceMap[paidBy]) balanceMap[paidBy] = 0;
      if (!balanceMap[splitUser]) balanceMap[splitUser] = 0;
      balanceMap[paidBy] += Number(row.amount_owed);
      balanceMap[splitUser] -= Number(row.amount_owed);
    }

    for (const s of settlements) {
      const paidBy = Number(s.paid_by);
      const paidTo = Number(s.paid_to);
      if (!balanceMap[paidBy]) balanceMap[paidBy] = 0;
      if (!balanceMap[paidTo]) balanceMap[paidTo] = 0;
      balanceMap[paidBy] += Number(s.amount);
      balanceMap[paidTo] -= Number(s.amount);
    }

    // Get all members ever in group
    const members = await query(`
      SELECT DISTINCT u.id, u.name FROM users u
      JOIN group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [groupId]);

    const balances = members.map(m => ({
      user_id: Number(m.id),
      user_name: m.name,
      net_balance: Math.round((balanceMap[Number(m.id)] || 0) * 100) / 100
    }));

    const debts = simplifyDebts(balances);

    // Per-person breakdown
    const breakdown = {};
    for (const m of members) {
      const uid = Number(m.id);
      const owes = await query(`
        SELECT e.description, e.expense_date, e.amount_inr, e.paid_by, es.amount_owed, u.name as paid_by_name
        FROM expenses e JOIN expense_splits es ON es.expense_id = e.id JOIN users u ON u.id = e.paid_by
        WHERE e.group_id = ? AND es.user_id = ? AND e.is_settlement = 0 AND e.paid_by != ?
        ORDER BY e.expense_date DESC
      `, [groupId, uid, uid]);

      const paid = await query(`
        SELECT e.description, e.expense_date, e.amount_inr, SUM(es.amount_owed) as total_owed_back
        FROM expenses e JOIN expense_splits es ON es.expense_id = e.id
        WHERE e.group_id = ? AND e.paid_by = ? AND e.is_settlement = 0
        GROUP BY e.id ORDER BY e.expense_date DESC
      `, [groupId, uid]);

      breakdown[uid] = {
        owes,
        paid,
        total_paid: paid.reduce((s, e) => s + Number(e.amount_inr), 0),
        total_owes: owes.reduce((s, e) => s + Number(e.amount_owed), 0)
      };
    }

    res.json({ balances, debts, breakdown });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function simplifyDebts(balances) {
  const creditors = balances.filter(b => b.net_balance > 0.01).map(b => ({ ...b }));
  const debtors = balances.filter(b => b.net_balance < -0.01).map(b => ({ ...b }));
  const transactions = [];
  let i = 0, j = 0;

  while (i < creditors.length && j < debtors.length) {
    const credit = creditors[i].net_balance;
    const debt = Math.abs(debtors[j].net_balance);
    const amount = Math.min(credit, debt);

    transactions.push({
      from: debtors[j].user_id,
      from_name: debtors[j].user_name,
      to: creditors[i].user_id,
      to_name: creditors[i].user_name,
      amount: Math.round(amount * 100) / 100
    });

    creditors[i].net_balance -= amount;
    debtors[j].net_balance += amount;

    if (creditors[i].net_balance < 0.01) i++;
    if (Math.abs(debtors[j].net_balance) < 0.01) j++;
  }

  return transactions;
}

module.exports = router;
