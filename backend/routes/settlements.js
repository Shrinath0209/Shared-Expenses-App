const express = require('express');
const { query, queryOne, run } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Create settlement
router.post('/', authenticate, async (req, res) => {
  try {
    const { group_id, paid_by, paid_to, amount, settlement_date, notes } = req.body;
    if (!group_id || !paid_by || !paid_to || !amount || !settlement_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await run(
      'INSERT INTO settlements (group_id, paid_by, paid_to, amount, settlement_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [group_id, paid_by, paid_to, amount, settlement_date, notes || null]
    );
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get settlements for a group
router.get('/group/:groupId', authenticate, async (req, res) => {
  try {
    const settlements = await query(`
      SELECT s.*, u1.name as paid_by_name, u2.name as paid_to_name
      FROM settlements s JOIN users u1 ON u1.id = s.paid_by JOIN users u2 ON u2.id = s.paid_to
      WHERE s.group_id = ? ORDER BY s.settlement_date DESC
    `, [req.params.groupId]);
    res.json(settlements);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete settlement
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await run('DELETE FROM settlements WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
