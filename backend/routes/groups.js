const express = require('express');
const { query, queryOne, run, transaction } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Create group
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, members } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name is required' });

    const result = await run('INSERT INTO groups_table (name, description, created_by) VALUES (?, ?, ?)', [name, description || '', req.user.id]);
    const groupId = Number(result.lastInsertRowid);

    const memberIds = [...new Set([req.user.id, ...(members || [])])];
    const now = new Date().toISOString().split('T')[0];

    for (const uid of memberIds) {
      try {
        await run('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', [groupId, uid, now]);
      } catch {}
    }

    res.json({ id: groupId, name, description });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all groups for user
router.get('/', authenticate, async (req, res) => {
  try {
    const groups = await query(`
      SELECT g.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.left_at IS NULL) as member_count,
        (SELECT COUNT(*) FROM expenses e WHERE e.group_id = g.id) as expense_count
      FROM groups_table g
      JOIN users u ON u.id = g.created_by
      WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = ? AND left_at IS NULL)
      ORDER BY g.created_at DESC
    `, [req.user.id]);
    res.json(groups);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single group with members
router.get('/:id', authenticate, async (req, res) => {
  try {
    const group = await queryOne(`
      SELECT g.*, u.name as created_by_name 
      FROM groups_table g JOIN users u ON u.id = g.created_by WHERE g.id = ?
    `, [req.params.id]);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const members = await query(`
      SELECT gm.*, u.name, u.email, gm.joined_at, gm.left_at
      FROM group_members gm JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ? ORDER BY gm.joined_at
    `, [req.params.id]);

    res.json({ ...group, members });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add member
router.post('/:id/members', authenticate, async (req, res) => {
  try {
    const { user_id, joined_at } = req.body;
    const date = joined_at || new Date().toISOString().split('T')[0];
    await run('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', [req.params.id, user_id, date]);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Member leaves
router.patch('/:id/members/:uid/leave', authenticate, async (req, res) => {
  try {
    const { left_at } = req.body;
    const date = left_at || new Date().toISOString().split('T')[0];
    await run('UPDATE group_members SET left_at = ? WHERE group_id = ? AND user_id = ? AND left_at IS NULL', [date, req.params.id, req.params.uid]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update group
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    await run('UPDATE groups_table SET name = ?, description = ? WHERE id = ?', [name, description, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
