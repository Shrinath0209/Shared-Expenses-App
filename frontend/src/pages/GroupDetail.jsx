import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Upload, Users, TrendingDown, TrendingUp, RefreshCw, Receipt } from 'lucide-react';
import ExpenseModal from '../components/ExpenseModal';
import SettlementModal from '../components/SettlementModal';
import ImportModal from '../components/ImportModal';

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState(null);
  const [activeTab, setActiveTab] = useState('expenses');
  const [loading, setLoading] = useState(true);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAll();
  }, [id]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [g, e, b] = await Promise.all([
        api.get(`/groups/${id}`),
        api.get(`/expenses/group/${id}?limit=100`),
        api.get(`/balances/group/${id}`)
      ]);
      setGroup(g.data);
      setExpenses(e.data.expenses);
      setBalances(b.data);
    } catch (err) {
      toast.error('Failed to load group');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const deleteExpense = async (expId) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${expId}`);
      toast.success('Expense deleted');
      fetchAll();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const filtered = expenses.filter(e =>
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.paid_by_name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="page-loading"><div className="spinner"></div></div>;
  if (!group) return null;

  const activeMembers = group.members?.filter(m => !m.left_at) || [];

  return (
    <div className="page">
      <div className="page-header">
        <div className="header-left">
          <Link to="/" className="back-btn"><ArrowLeft size={20} /></Link>
          <div>
            <h1>{group.name}</h1>
            <p className="subtitle">{group.description || 'Shared expenses group'}</p>
          </div>
        </div>
        <div className="header-actions">
          <button id="import-csv-btn" className="btn-outline" onClick={() => setShowImportModal(true)}>
            <Upload size={16} /> Import CSV
          </button>
          <button id="settle-btn" className="btn-outline" onClick={() => setShowSettleModal(true)}>
            <RefreshCw size={16} /> Settle Up
          </button>
          <button id="add-expense-btn" className="btn-primary" onClick={() => { setEditExpense(null); setShowExpenseModal(true); }}>
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      {/* Balance Summary Cards */}
      {balances && (
        <div className="balance-summary">
          {balances.balances.map(b => (
            <div key={b.user_id} className={`balance-card ${b.net_balance > 0 ? 'positive' : b.net_balance < 0 ? 'negative' : 'zero'}`}>
              <div className="balance-name">{b.user_name}</div>
              <div className="balance-amount">
                {b.net_balance > 0 ? <TrendingUp size={16} /> : b.net_balance < 0 ? <TrendingDown size={16} /> : null}
                ₹{Math.abs(b.net_balance).toFixed(0)}
              </div>
              <div className="balance-label">
                {b.net_balance > 0 ? 'gets back' : b.net_balance < 0 ? 'owes' : 'settled'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Who owes whom */}
      {balances?.debts?.length > 0 && (
        <div className="debts-section">
          <h3>Suggested Settlements</h3>
          <div className="debts-list">
            {balances.debts.map((d, i) => (
              <div key={i} className="debt-item">
                <span className="debtor">{d.from_name}</span>
                <span className="debt-arrow">→ pays →</span>
                <span className="creditor">{d.to_name}</span>
                <span className="debt-amount">₹{d.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button id="tab-expenses" className={`tab ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>
          <Receipt size={16} /> Expenses ({expenses.length})
        </button>
        <button id="tab-members" className={`tab ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>
          <Users size={16} /> Members ({group.members?.length})
        </button>
        <button id="tab-breakdown" className={`tab ${activeTab === 'breakdown' ? 'active' : ''}`} onClick={() => setActiveTab('breakdown')}>
          <TrendingUp size={16} /> Breakdown
        </button>
      </div>

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <div className="tab-content">
          <div className="search-bar">
            <input id="expense-search" type="text" placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <Receipt size={48} className="empty-icon" />
              <p>No expenses yet. Add your first one!</p>
            </div>
          ) : (
            <div className="expenses-list">
              {filtered.map(exp => (
                <div key={exp.id} className={`expense-item ${exp.is_settlement ? 'settlement' : ''}`}>
                  <div className="expense-main">
                    <div className="expense-icon">{exp.is_settlement ? '💸' : getCategoryIcon(exp.category)}</div>
                    <div className="expense-info">
                      <div className="expense-desc">
                        {exp.description}
                        {exp.is_settlement && <span className="badge settlement-badge">Settlement</span>}
                        {exp.import_row && <span className="badge import-badge">Imported</span>}
                      </div>
                      <div className="expense-meta">
                        <span>{exp.expense_date}</span>
                        <span>•</span>
                        <span>Paid by <strong>{exp.paid_by_name}</strong></span>
                        {exp.currency !== 'INR' && <span className="currency-badge">{exp.currency}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="expense-right">
                    <div className="expense-amount">₹{exp.amount_inr.toFixed(2)}</div>
                    <div className="expense-actions">
                      <button id={`edit-exp-${exp.id}`} className="icon-btn" onClick={() => { setEditExpense(exp); setShowExpenseModal(true); }}>✏️</button>
                      <button id={`del-exp-${exp.id}`} className="icon-btn danger" onClick={() => deleteExpense(exp.id)}>🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="tab-content">
          <div className="members-list">
            {group.members?.map(m => (
              <div key={m.id} className={`member-item ${m.left_at ? 'inactive' : 'active'}`}>
                <div className="member-avatar">{m.name[0]}</div>
                <div className="member-info">
                  <div className="member-name">{m.name}</div>
                  <div className="member-dates">
                    Joined: {m.joined_at}
                    {m.left_at && ` • Left: ${m.left_at}`}
                  </div>
                </div>
                <div className={`member-status ${m.left_at ? 'left' : 'active'}`}>
                  {m.left_at ? 'Left' : 'Active'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Breakdown Tab */}
      {activeTab === 'breakdown' && balances && (
        <div className="tab-content">
          {balances.balances.map(b => {
            const breakdown = balances.breakdown?.[b.user_id];
            return (
              <div key={b.user_id} className="breakdown-card">
                <div className="breakdown-header">
                  <div className="member-avatar">{b.user_name[0]}</div>
                  <h3>{b.user_name}</h3>
                  <div className={`balance-pill ${b.net_balance >= 0 ? 'positive' : 'negative'}`}>
                    {b.net_balance >= 0 ? '+' : ''}₹{b.net_balance.toFixed(2)}
                  </div>
                </div>
                {breakdown && (
                  <div className="breakdown-details">
                    <div className="breakdown-stat">
                      <span>Total Paid</span>
                      <strong>₹{breakdown.total_paid.toFixed(2)}</strong>
                    </div>
                    <div className="breakdown-stat">
                      <span>Total Owes</span>
                      <strong>₹{breakdown.total_owes.toFixed(2)}</strong>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showExpenseModal && (
        <ExpenseModal
          groupId={id}
          members={activeMembers}
          expense={editExpense}
          onClose={() => { setShowExpenseModal(false); setEditExpense(null); }}
          onSave={fetchAll}
        />
      )}
      {showSettleModal && (
        <SettlementModal
          groupId={id}
          members={activeMembers}
          debts={balances?.debts || []}
          onClose={() => setShowSettleModal(false)}
          onSave={fetchAll}
        />
      )}
      {showImportModal && (
        <ImportModal
          groupId={id}
          onClose={() => setShowImportModal(false)}
          onSave={fetchAll}
        />
      )}
    </div>
  );
}

function getCategoryIcon(cat) {
  const icons = { Food: '🍕', Utilities: '⚡', Entertainment: '🎬', Home: '🏠', Travel: '✈️', Other: '📦' };
  return icons[cat] || '📦';
}
