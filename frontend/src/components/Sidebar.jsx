import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, LogOut, Receipt } from 'lucide-react';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">₹</div>
        <h1>SplitEase</h1>
      </div>

      <nav className="sidebar-nav">
        <Link
          to="/"
          id="nav-dashboard"
          className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </Link>
        <Link
          to="/"
          id="nav-groups"
          className={`nav-item ${location.pathname.startsWith('/groups') ? 'active' : ''}`}
        >
          <Users size={18} />
          My Groups
        </Link>
      </nav>

      <div className="sidebar-footer">
        <div className="nav-item" style={{ justifyContent: 'space-between', cursor: 'default' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="member-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
              {user?.name?.[0]}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user?.email}</div>
            </div>
          </div>
          <button id="logout-btn" className="icon-btn" onClick={handleLogout} title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
