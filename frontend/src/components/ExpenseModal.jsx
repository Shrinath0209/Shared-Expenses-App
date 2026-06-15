import React, { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const SPLIT_TYPES = [
  { value: 'equal', label: 'Split Equally' },
  { value: 'exact', label: 'Exact Amounts' },
  { value: 'percentage', label: 'By Percentage' },
  { value: 'shares', label: 'By Shares' }
];

const CATEGORIES = ['Food', 'Utilities', 'Entertainment', 'Home', 'Travel', 'Health', 'Other'];

export default function ExpenseModal({ groupId, members, expense, onClose, onSave }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: 'INR',
    exchange_rate: 1.0,
    paid_by: user?.id || '',
    split_type: 'equal',
    expense_date: new Date().toISOString().split('T')[0],
    category: 'Other',
    notes: '',
    splits: []
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expense) {
      setForm({
        description: expense.description,
        amount: expense.amount,
        currency: expense.currency || 'INR',
        exchange_rate: expense.exchange_rate || 1.0,
        paid_by: expense.paid_by,
        split_type: expense.split_type,
        expense_date: expense.expense_date,
        category: expense.category || 'Other',
        notes: expense.notes || '',
        splits: expense.splits || []
      });
    }
  }, [expense]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        ...form,
        group_id: groupId,
        amount: parseFloat(form.amount),
        exchange_rate: form.currency === 'USD' ? parseFloat(form.exchange_rate) || 83.5 : 1.0,
        paid_by: parseInt(form.paid_by)
      };

      if (expense) {
        await api.put(`/expenses/${expense.id}`, data);
        toast.success('Expense updated!');
      } else {
        await api.post('/expenses', data);
        toast.success('Expense added!');
      }
      onSave();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2>{expense ? 'Edit Expense' : 'Add New Expense'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Description *</label>
            <input id="exp-description" type="text" placeholder="What was this expense for?"
              value={form.description} onChange={e => setForm({...form, description: e.target.value})} required />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Amount *</label>
              <input id="exp-amount" type="number" step="0.01" min="0.01" placeholder="0.00"
                value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Currency</label>
              <select id="exp-currency" value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}>
                <option value="INR">₹ INR</option>
                <option value="USD">$ USD</option>
              </select>
            </div>
          </div>

          {form.currency === 'USD' && (
            <div className="form-group">
              <label>Exchange Rate (1 USD = ? INR)</label>
              <input id="exp-rate" type="number" step="0.01" placeholder="83.50"
                value={form.exchange_rate} onChange={e => setForm({...form, exchange_rate: e.target.value})} />
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Paid by *</label>
              <select id="exp-paidby" value={form.paid_by} onChange={e => setForm({...form, paid_by: e.target.value})} required>
                <option value="">Select member</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input id="exp-date" type="date" value={form.expense_date}
                onChange={e => setForm({...form, expense_date: e.target.value})} required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Split Type</label>
              <select id="exp-splittype" value={form.split_type} onChange={e => setForm({...form, split_type: e.target.value})}>
                {SPLIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Category</label>
              <select id="exp-category" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {form.split_type !== 'equal' && members.length > 0 && (
            <div className="form-group">
              <label>Split Details</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {members.map(m => (
                  <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 80, fontSize: 13 }}>{m.name}</span>
                    <input
                      id={`split-${m.user_id}`}
                      type="number" step="0.01" min="0"
                      placeholder={form.split_type === 'percentage' ? '% share' : form.split_type === 'shares' ? 'shares' : 'amount'}
                      style={{ flex: 1 }}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        const key = form.split_type === 'percentage' ? 'percentage' : form.split_type === 'shares' ? 'shares' : 'amount';
                        const existing = form.splits.find(s => s.user_id === m.user_id);
                        const splits = existing
                          ? form.splits.map(s => s.user_id === m.user_id ? {...s, [key]: val} : s)
                          : [...form.splits, { user_id: m.user_id, [key]: val }];
                        setForm({...form, splits});
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Notes</label>
            <input id="exp-notes" type="text" placeholder="Optional note"
              value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button id="save-expense-btn" type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving...' : expense ? 'Update Expense' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
