import { useState, useEffect, useCallback } from 'react';
import type { AppState, Notification } from './types';
import Timer from './pages/Timer';
import Reminders from './pages/Reminders';
import Login from './pages/Login';
import NotificationDrawer from './components/NotificationDrawer';

interface UserProfile {
  id: string;
  email: string;
  username: string;
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [hash, setHash] = useState(window.location.hash || '#timer');
  const [todayHours, setTodayHours] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  // ── Theme ──────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('metric_theme');
    const isDark = saved === 'dark';
    setDarkMode(isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('metric_theme', next ? 'dark' : 'light');
  };

  // ── Session restore ────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('metric_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  // ── Hash routing ───────────────────────────────
  useEffect(() => {
    const handleHash = () => setHash(window.location.hash || '#timer');
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // ── API helper (attaches user ID header) ───────
  const apiCall = useCallback(async (endpoint: string, method = 'GET', body: any = null): Promise<any> => {
    const headers: any = { 'Content-Type': 'application/json' };
    const saved = localStorage.getItem('metric_user');
    if (saved) {
      try { headers['X-User-Id'] = JSON.parse(saved).id; } catch (e) { console.error(e); }
    }
    const options: RequestInit = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const resp = await fetch(endpoint, options);
    if (!resp.ok) throw new Error(`API error: ${resp.statusText}`);
    return await resp.json();
  }, []);

  // ── Load workspace state ───────────────────────
  useEffect(() => {
    if (user) {
      apiCall('/api/state')
        .then(setState)
        .catch(err => console.error('Failed to load state:', err));
    } else {
      setState(null);
    }
  }, [user]);

  // ── Today's hours (ticking) ────────────────────
  useEffect(() => {
    const calculate = () => {
      if (!state) return;
      const todayStr = new Date().toISOString().split('T')[0];
      let secs = 0;
      state.timeEntries.forEach(e => {
        if (e.start?.split('T')[0] === todayStr && e.end) {
          secs += Math.max(0, Math.floor((new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000));
        }
      });
      if (state.activeTimer?.start?.split('T')[0] === todayStr) {
        secs += Math.max(0, Math.floor((Date.now() - new Date(state.activeTimer.start).getTime()) / 1000));
      }
      setTodayHours(secs / 3600);
    };
    calculate();
    const iv = setInterval(calculate, 1000);
    return () => clearInterval(iv);
  }, [state]);

  // ── Reminder alarm checker ─────────────────────
  useEffect(() => {
    if (!state?.reminders) return;
    if (Notification.permission === 'default') Notification.requestPermission();

    const check = async () => {
      const now = Date.now();
      const toTrigger = state.reminders.find(r => !r.triggered && new Date(r.scheduledAt).getTime() <= now);
      if (toTrigger) {
        try {
          const msg = `⏰ Reminder: "${toTrigger.description}"${toTrigger.assignee ? ` — assigned to @${toTrigger.assignee}` : ''}`;
          if (Notification.permission === 'granted') new Notification('Metric', { body: msg });
          else alert(msg);
          const newState = await apiCall(`/api/reminders/${toTrigger.id}/trigger`, 'PUT');
          setState(newState);
        } catch (err) { console.error('Reminder trigger failed:', err); }
      }
    };
    const iv = setInterval(check, 4000);
    return () => clearInterval(iv);
  }, [state]);

  // ── Notification polling (every 6s) ───────────
  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      try {
        const data = await apiCall('/api/notifications');
        setNotifications(data);
      } catch (err) { /* silent */ }
    };
    poll();
    const iv = setInterval(poll, 6000);
    return () => clearInterval(iv);
  }, [user]);

  const markNotifRead = async (id: string) => {
    try {
      await apiCall(`/api/notifications/${id}/read`, 'PUT');
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) { console.error(err); }
  };

  const markAllNotifRead = async () => {
    try {
      await apiCall('/api/notifications/read-all', 'PUT');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) { console.error(err); }
  };

  const handleLoginSuccess = (profile: UserProfile) => {
    localStorage.setItem('metric_user', JSON.stringify(profile));
    setUser(profile);
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('metric_user');
      setUser(null);
    }
  };

  // ── Render: unauthenticated ───────────────────
  if (!user) return <Login onLoginSuccess={handleLoginSuccess} apiCall={apiCall} />;

  // ── Render: loading ───────────────────────────
  if (!state) {
    return (
      <div className="d-flex align-items-center justify-content-center min-vh-100">
        <div className="text-center">
          <div className="spinner-border mb-3" style={{ color: 'var(--primary-color)' }} role="status"></div>
          <h5 className="fw-bold" style={{ color: 'var(--text-main)' }}>Connecting…</h5>
          <p className="text-muted small">Loading your workspace</p>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const progressPercent = Math.min(Math.round((todayHours / 8) * 100), 100);

  const renderPage = () => {
    switch (hash) {
      case '#timer':    return <Timer state={state} onUpdateState={setState} apiCall={apiCall} />;
      case '#schedule': return <Reminders state={state} onUpdateState={setState} apiCall={apiCall} />;
      default:          return <Timer state={state} onUpdateState={setState} apiCall={apiCall} />;
    }
  };

  return (
    <div className="min-vh-100">
      {/* Ambient glows */}
      <div className="glow-mesh glow-mesh-1"></div>
      <div className="glow-mesh glow-mesh-2"></div>
      <div className="glow-mesh glow-mesh-3"></div>

      {/* Notification Drawer */}
      <NotificationDrawer
        open={notifOpen}
        notifications={notifications}
        onClose={() => setNotifOpen(false)}
        onMarkRead={markNotifRead}
        onMarkAllRead={markAllNotifRead}
      />

      <div className="container-fluid">
        <div className="row min-vh-100">

          {/* ── Sidebar ───────────────────────── */}
          <aside className="app-sidebar border-end px-0 d-flex flex-column" style={{ zIndex: 100 }}>
            
            {/* Logo + Bell row */}
            <div className="p-3 border-bottom d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <img src="/logo.png" alt="Metric" style={{ width: 28, height: 28, borderRadius: 6 }} />
                <span className="fs-5 fw-bold" style={{ color: 'var(--text-main)' }}>Metric</span>
              </div>
              {/* Notification bell */}
              <button className="notif-bell-btn" onClick={() => setNotifOpen(true)} title="Notifications">
                🔔
                {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
              </button>
            </div>

            {/* Nav links */}
            <div className="py-3 flex-grow-1 overflow-auto d-flex flex-column">
              <div className="menu-header">Task Hub</div>
              <nav className="nav flex-column mb-3 px-2">
                <a href="#timer" className={`nav-link menu-item ${hash === '#timer' ? 'active' : ''}`}>
                  <span className="icon-box icon-timer">⏱</span>
                  <span>Timer</span>
                </a>
                <a href="#schedule" className={`nav-link menu-item ${hash === '#schedule' ? 'active' : ''}`}>
                  <span className="icon-box icon-timesheets">📅</span>
                  <span>Schedule</span>
                </a>
              </nav>
            </div>

            {/* Sidebar footer: theme toggle + logout */}
            <div className="sidebar-footer-area">
              {/* Theme toggle */}
              <button className="sidebar-action-btn" onClick={toggleTheme} title="Toggle Light/Dark mode">
                {darkMode ? '☀️' : '🌙'}
                <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>

              {/* Logout */}
              <button className="sidebar-action-btn" onClick={handleLogout} title="Logout">
                🚪
                <span>Logout <span style={{ fontWeight: 400, opacity: 0.7 }}>(@{user.username})</span></span>
              </button>

              {/* Daily target progress */}
              <div className="p-2 mt-1 rounded-2 border" style={{ background: 'var(--bg-app)' }}>
                <div className="d-flex justify-content-between mb-1">
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Today's Target</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-main)' }}>{todayHours.toFixed(1)}h / 8h</span>
                </div>
                <div className="progress" style={{ height: 5 }}>
                  <div
                    className="progress-bar"
                    style={{ width: `${progressPercent}%`, background: 'var(--primary-color)', transition: 'width 0.3s' }}
                    role="progressbar"
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* ── Main area ─────────────────────── */}
          <main className="app-main py-4 px-4" style={{ zIndex: 1 }}>
            {renderPage()}
          </main>

        </div>
      </div>
    </div>
  );
}
