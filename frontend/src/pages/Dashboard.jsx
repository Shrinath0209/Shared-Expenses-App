import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { Users, Plus, TrendingUp, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const { data } = await api.get('/groups');
      setGroups(data);
    } catch (e) {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    try {
      await api.post('/groups', newGroup);
      toast.success('Group created!');
      setShowCreate(false);
      setNewGroup({ name: '', description: '' });
      fetchGroups();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create group');
    }
  };

  if (loading) return <div className="page-loading"><div className="spinner"></div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Welcome back, {user?.name} 👋</h1>
          <p className="subtitle">Manage your shared expenses across all groups</p>
        </div>
        <button id="create-group-btn" className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={18} /> New Group
        </button>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Create New Group</h2>
            <form onSubmit={createGroup}>
              <div className="form-group">
                <label>Group Name</label>
                <input id="group-name" type="text" placeholder="e.g., Flat Mates 2026" value={newGroup.name} onChange={e => setNewGroup({ ...newGroup, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <input id="group-desc" type="text" placeholder="What's this group for?" value={newGroup.description} onChange={e => setNewGroup({ ...newGroup, description: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="empty-state">
          <Users size={64} className="empty-icon" />
          <h2>No groups yet</h2>
          <p>Create your first group to start tracking shared expenses</p>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={18} /> Create Group
          </button>
        </div>
      ) : (
        <div className="groups-grid">
          {groups.map(group => (
            <Link key={group.id} to={`/groups/${group.id}`} className="group-card">
              <div className="group-card-header">
                <div className="group-avatar">{group.name[0]}</div>
                <div>
                  <h3>{group.name}</h3>
                  <p>{group.description || 'No description'}</p>
                </div>
              </div>
              <div className="group-stats">
                <div className="stat">
                  <Users size={14} />
                  <span>{group.member_count} members</span>
                </div>
                <div className="stat">
                  <TrendingUp size={14} />
                  <span>{group.expense_count} expenses</span>
                </div>
              </div>
              <div className="group-card-footer">
                View Group <ArrowRight size={14} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
