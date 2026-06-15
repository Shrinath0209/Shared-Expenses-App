import React, { useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';

export default function SettlementModal({ groupId, members, debts, onClose, onSave }) {
  const [form, setForm] = useState({
    paid_by: debts[0]?.from || '',
    paid_to: debts[0]?.to || '',
    amount: debts[0]?.amount || '',
    settlement_date: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/settlements', {
        group_id: parseInt(groupId),
        paid_by: parseInt(form.paid_by),
        paid_to: parseInt(form.paid_to),
        amount: parseFloat(form.amount),
        settlement_date: form.settlement_date,
        notes: form.notes
      });
      toast.success('Settlement recorded!');
      onSave();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to record settlement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>💸 Record Settlement</h2>

        {debts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>Suggested settlements:</p>
            {debts.map((d, i) => (
              <button key={i} id={`debt-${i}`} className="debt-item" style={{ width: '100%', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 8, marginBottom: 6 }}
                onClick={() => setForm({...form, paid_by: d.from, paid_to: d.to, amount: d.amount})}>
                <span className="debtor">{d.from_name}</span>
                <span className="debt-arrow">→ pays →</span>
                <span className="creditor">{d.to_name}</span>
                <span className="debt-amount">₹{d.amount.toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Paid By</label>
              <select id="settle-from" value={form.paid_by} onChange={e => setForm({...form, paid_by: e.target.value})} required>
                <option value="">Select...</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Paid To</label>
              <select id="settle-to" value={form.paid_to} onChange={e => setForm({...form, paid_to: e.target.value})} required>
                <option value="">Select...</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Amount (₹)</label>
              <input id="settle-amount" type="number" step="0.01" min="0.01" placeholder="0.00"
                value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input id="settle-date" type="date" value={form.settlement_date}
                onChange={e => setForm({...form, settlement_date: e.target.value})} required />
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <input id="settle-notes" type="text" placeholder="e.g., Paid via UPI"
              value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button id="confirm-settle-btn" type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Recording...' : 'Record Settlement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
