import { useState, useEffect, useCallback } from 'react';
import type { AppState } from './types';
import Timer from './pages/Timer';
import Reminders from './pages/Reminders';
import Reports from './pages/Reports';
import Login from './pages/Login';
import ClientPortal from './pages/ClientPortal';
import ErrorBoundary from './components/ErrorBoundary';

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
    
    const baseUrl = import.meta.env.VITE_API_URL || '';
    const resp = await fetch(`${baseUrl}${endpoint}`, options);
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

  // ── Render: public client portal ─────────────
  if (hash.startsWith('#portal/')) {
    const pId = hash.split('/')[1] || '';
    return <ClientPortal projectId={pId} />;
  }

  // ── Render: unauthenticated ───────────────────
  if (!user) return <Login onLoginSuccess={handleLoginSuccess} apiCall={apiCall} />;

  // ── Render: loading ───────────────────────────
  if (!state) {
    return (
      <div className="min-vh-100">
        <div className="container-fluid">
          <div className="row min-vh-100">
            <aside className="app-sidebar border-end px-0 d-flex flex-column" style={{ background: 'var(--sidebar-bg)' }}>
               <div className="p-3 border-bottom d-flex align-items-center gap-2">
                 <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 6 }}></div>
                 <div className="skeleton" style={{ width: 80, height: 20 }}></div>
               </div>
               <div className="py-3 px-3 flex-grow-1">
                 <div className="skeleton mb-3" style={{ width: 80, height: 12 }}></div>
                 <div className="skeleton mb-2" style={{ width: '100%', height: 36 }}></div>
                 <div className="skeleton mb-2" style={{ width: '100%', height: 36 }}></div>
               </div>
            </aside>
            <main className="app-main py-4 px-4">
               <div className="skeleton mb-4" style={{ width: 150, height: 32 }}></div>
               <div className="skeleton mb-4" style={{ width: '100%', height: 64, borderRadius: 12 }}></div>
               <div className="row g-4">
                 <div className="col-lg-8">
                   <div className="skeleton mb-3" style={{ width: 100, height: 20 }}></div>
                   <div className="skeleton mb-2" style={{ width: '100%', height: 60 }}></div>
                   <div className="skeleton mb-2" style={{ width: '100%', height: 60 }}></div>
                   <div className="skeleton mb-2" style={{ width: '100%', height: 60 }}></div>
                 </div>
                 <div className="col-lg-4">
                   <div className="skeleton mb-3" style={{ width: 100, height: 20 }}></div>
                   <div className="skeleton mb-4" style={{ width: '100%', height: 200, borderRadius: 12 }}></div>
                 </div>
               </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  const progressPercent = Math.min(Math.round((todayHours / 8) * 100), 100);

  const renderPage = () => {
    switch (hash) {
      case '#timer':    return <Timer state={state} onUpdateState={setState} apiCall={apiCall} />;
      case '#schedule': return <Reminders state={state} onUpdateState={setState} apiCall={apiCall} />;
      case '#reports':  return <Reports state={state} />;
      default:          return <Timer state={state} onUpdateState={setState} apiCall={apiCall} />;
    }
  };

  return (
    <div className="min-vh-100">
      <div className="container-fluid">
        <div className="row min-vh-100">

          {/* ── Sidebar ───────────────────────── */}
          <aside className="app-sidebar border-end px-0 d-flex flex-column" style={{ zIndex: 100 }}>
            
            {/* Logo row */}
            <div className="p-3 border-bottom d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <img src="/logo.png" alt="Metric" style={{ width: 28, height: 28, borderRadius: 6 }} />
                <span className="fs-5 fw-bold" style={{ color: 'var(--text-main)' }}>Metric</span>
              </div>
            </div>

            {/* Nav links */}
            <div className="py-3 flex-grow-1 overflow-auto d-flex flex-column">
              <div className="menu-header">Task Hub</div>
              <nav className="nav flex-column mb-3 px-2">
                <a href="#timer" className={`nav-link menu-item ${hash === '#timer' ? 'active' : ''}`}>
                  <span className="icon-box icon-timer">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </span>
                  <span>Timer</span>
                </a>
                <a href="#schedule" className={`nav-link menu-item ${hash === '#schedule' ? 'active' : ''}`}>
                  <span className="icon-box icon-timesheets">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </span>
                  <span>Schedule</span>
                </a>
                <a href="#reports" className={`nav-link menu-item ${hash === '#reports' ? 'active' : ''}`}>
                  <span className="icon-box icon-reports">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  </span>
                  <span>Reports</span>
                </a>
              </nav>
            </div>

            {/* Sidebar footer: theme toggle + logout */}
            <div className="sidebar-footer-area">
              {/* Theme toggle */}
              <button className="sidebar-action-btn" onClick={toggleTheme} title="Toggle Light/Dark mode">
                {darkMode
                  ? <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                }
                <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>

              {/* Logout */}
              <button className="sidebar-action-btn" onClick={handleLogout} title="Logout">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                <span>Logout <span style={{ fontWeight: 400, opacity: 0.7 }}>(@{user.username})</span></span>
              </button>

              {/* Daily target progress */}
              <div className="p-2 mt-1 rounded-2 border" style={{ background: 'var(--bg-app)' }}>
                <div className="d-flex justify-content-between mb-1">
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Today's Target</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-main)' }}>{todayHours.toFixed(1)}h / 8h</span>
                </div>
                <div className="progress mb-2" style={{ height: 5 }}>
                  <div
                    className="progress-bar"
                    style={{ width: `${progressPercent}%`, background: 'var(--primary-color)', transition: 'width 0.3s' }}
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <div className="d-flex justify-content-between">
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Est. Earnings</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--success-color)' }}>
                    {state.workspace.currency} {(todayHours * state.workspace.hourlyRate).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </aside>

          {/* ── Main area ─────────────────────── */}
          <main className="app-main py-4 px-4" style={{ zIndex: 1 }}>
            <ErrorBoundary>
              {renderPage()}
            </ErrorBoundary>
          </main>

        </div>
      </div>
    </div>
  );
}
