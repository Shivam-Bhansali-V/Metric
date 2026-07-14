import { useState, useEffect, useRef } from 'react';
import type { AppState, TimeEntry } from '../types';
import { formatSeconds, formatDateTime, getProjectInfo } from '../utils';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface TimerProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  apiCall: (endpoint: string, method: string, body?: any) => Promise<AppState>;
}

const PRESET_COLORS = ['#6366f1', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];

export default function Timer({ state, onUpdateState, apiCall }: TimerProps) {
  const [desc, setDesc] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [assignee, setAssignee] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [billable, setBillable] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  // Dropdown States
  const [showProjDropdown, setShowProjDropdown] = useState(false);
  const [projQuery, setProjQuery] = useState('');

  // Quick Project Creator inside Dropdown
  const [newProjName, setNewProjName] = useState('');
  const [newProjColor, setNewProjColor] = useState(PRESET_COLORS[0]);

  const intervalRef = useRef<any>(null);

  // Sync state with active timer on load/update
  useEffect(() => {
    if (state.activeTimer) {
      setDesc(state.activeTimer.description);
      setProjectId(state.activeTimer.projectId);
      setTagIds(state.activeTimer.tagIds || []);
      setBillable(state.activeTimer.billable);
      setAssignee(state.activeTimer.assignee || '');
      
      const startMs = new Date(state.activeTimer.start).getTime();
      setElapsed(Math.floor((Date.now() - startMs) / 1000));

      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startMs) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setDesc('');
      setProjectId(null);
      setTagIds([]);
      setBillable(true);
      setAssignee('');
      setElapsed(0);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.activeTimer]);

  const handleDescBlur = async () => {
    if (state.activeTimer && desc !== state.activeTimer.description) {
      try {
        const newState = await apiCall('/api/timer/update', 'POST', { description: desc });
        onUpdateState(newState);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAssigneeBlur = async () => {
    if (state.activeTimer && assignee !== state.activeTimer.assignee) {
      try {
        const newState = await apiCall('/api/timer/update', 'POST', { assignee: assignee.trim() || null });
        onUpdateState(newState);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleStartStop = async () => {
    if (state.activeTimer) {
      try {
        const newState = await apiCall('/api/timer/stop', 'POST', {
          description: desc.trim() || "(no description)",
          projectId,
          tagIds,
          billable,
          assignee: assignee.trim() || null
        });
        onUpdateState(newState);
      } catch (err) {
        console.error(err);
      }
    } else {
      try {
        const newState = await apiCall('/api/timer/start', 'POST', {
          description: desc.trim(),
          projectId,
          tagIds,
          billable,
          assignee: assignee.trim() || null
        });
        onUpdateState(newState);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const selectProject = async (pId: string | null) => {
    setProjectId(pId);
    setShowProjDropdown(false);
    if (state.activeTimer) {
      try {
        const newState = await apiCall('/api/timer/update', 'POST', { projectId: pId });
        onUpdateState(newState);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Quick Create Project inside Dropdown
  const handleQuickCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;

    try {
      const newState = await apiCall('/api/projects', 'POST', {
        name: newProjName.trim(),
        color: newProjColor,
        billable: true,
        rate: 0.0
      });
      onUpdateState(newState);

      // Auto select the newly created project
      const createdProj = newState.projects.find(p => p.name === newProjName.trim());
      if (createdProj) {
        await selectProject(createdProj.id);
      }

      setNewProjName('');
      setShowProjDropdown(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (confirm('Are you sure you want to delete this log?')) {
      try {
        const newState = await apiCall(`/api/time-entries/${id}`, 'DELETE');
        onUpdateState(newState);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Group completed time entries by date
  const groups: Record<string, TimeEntry[]> = {};
  state.timeEntries.forEach(entry => {
    const d = new Date(entry.start);
    const dateStr = d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(entry);
  });
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const projInfo = getProjectInfo(state, projectId);

  // --- CHART 1: TODAY'S PIE CHART ---
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEntries = state.timeEntries.filter(e => {
    if (!e.end) return false;
    const entryStart = new Date(e.start);
    return entryStart >= todayStart;
  });

  const projectDurations: Record<string, number> = {};
  todayEntries.forEach(e => {
    if (e.projectId && e.end) {
      const durationSecs = Math.max(0, Math.floor((new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000));
      projectDurations[e.projectId] = (projectDurations[e.projectId] || 0) + durationSecs;
    }
  });

  const pieLabels: string[] = [];
  const pieData: number[] = [];
  const pieColors: string[] = [];

  Object.entries(projectDurations).forEach(([pId, secs]) => {
    const proj = state.projects.find(p => p.id === pId);
    pieLabels.push(proj ? proj.name : 'Unknown Project');
    pieData.push(Number((secs / 3600).toFixed(2))); // convert to hours
    pieColors.push(proj ? proj.color : '#cbd5e1');
  });

  const pieChartData = {
    labels: pieLabels,
    datasets: [
      {
        data: pieData,
        backgroundColor: pieColors,
        borderWidth: 1
      }
    ]
  };

  // --- CHART 2: WEEKLY BAR CHART (LAST 7 DAYS) ---
  const last7Days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    last7Days.push(d);
  }

  const barLabels = last7Days.map(d => d.toLocaleDateString([], { weekday: 'short', day: 'numeric' }));
  const barData = last7Days.map(dayDate => {
    const dayEnd = new Date(dayDate);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayEntries = state.timeEntries.filter(e => {
      if (!e.end) return false;
      const entryStart = new Date(e.start);
      return entryStart >= dayDate && entryStart < dayEnd;
    });

    const totalSecs = dayEntries.reduce((sum, e) => {
      if (!e.end) return sum;
      return sum + Math.max(0, Math.floor((new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000));
    }, 0);

    return Number((totalSecs / 3600).toFixed(2)); // hours
  });

  const barChartData = {
    labels: barLabels,
    datasets: [
      {
        label: 'Hours Worked',
        data: barData,
        backgroundColor: '#6366f1',
        borderRadius: 4
      }
    ]
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="h3 fw-bold mb-0">Time Tracker</h2>
      </div>

      {/* Tracker Bar */}
      <div className="card p-2 mb-4 tracker-bar bg-white rounded border position-relative">
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-5">
            <input 
              type="text" 
              className="tracker-desc px-2 fs-5 w-100 border-0" 
              placeholder="What are you working on?" 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={handleDescBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDescBlur(); }}
              style={{ outline: 'none', background: 'transparent', color: 'var(--text-main)' }}
            />
          </div>
          
          <div className="col-12 col-md-3 d-flex align-items-center gap-2">
            {/* Project Picker Dropdown */}
            <div className="position-relative w-100">
              <button 
                className={`picker-btn w-100 text-start ${projectId ? 'active' : ''}`} 
                onClick={() => { setShowProjDropdown(!showProjDropdown); }}
              >
                {projectId && <span className="color-dot me-2" style={{ backgroundColor: projInfo.color }}></span>}
                <span>{projInfo.name}</span>
              </button>
              
              {showProjDropdown && (
                <div className="dropdown-menu show p-2 border shadow-lg position-absolute w-100" style={{ zIndex: 1000, top: '100%', left: 0, minWidth: '240px', background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                  <input 
                    type="text" 
                    className="form-control form-control-sm mb-2" 
                    placeholder="Search projects..." 
                    value={projQuery}
                    onChange={(e) => setProjQuery(e.target.value)}
                    autoFocus
                  />
                  <div className="list-group list-group-flush mb-2" style={{ maxHeight: '160px', overflowY: 'auto', fontSize: '0.875rem', background: 'var(--bg-card)' }}>
                    <button type="button" className="list-group-item list-group-item-action text-start py-1" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }} onClick={() => selectProject(null)}>
                      No Project
                    </button>
                    {state.projects.filter(p => p.name.toLowerCase().includes(projQuery.toLowerCase())).map(p => (
                      <button 
                        key={p.id} 
                        type="button" 
                        className="list-group-item list-group-item-action d-flex align-items-center gap-2 text-start py-1"
                        style={{ background: 'var(--bg-card)', color: 'var(--text-main)' }}
                        onClick={() => selectProject(p.id)}
                      >
                        <span className="color-dot" style={{ backgroundColor: p.color }}></span>
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                  
                  {/* Quick Project Creation Section */}
                  <div className="border-top pt-2">
                    <form onSubmit={handleQuickCreateProject} className="d-flex flex-column gap-1">
                      <input 
                        type="text" 
                        className="form-control form-control-sm" 
                        placeholder="Create new project..." 
                        value={newProjName}
                        onChange={(e) => setNewProjName(e.target.value)}
                      />
                      <div className="d-flex gap-1 align-items-center py-1">
                        {PRESET_COLORS.map(c => (
                          <button 
                            key={c}
                            type="button"
                            className="color-dot"
                            style={{ 
                              backgroundColor: c, 
                              width: '14px', 
                              height: '14px', 
                              border: newProjColor === c ? '2px solid #000' : 'none', 
                              cursor: 'pointer' 
                            }}
                            onClick={() => setNewProjColor(c)}
                          />
                        ))}
                      </div>
                      <button type="submit" className="btn btn-primary btn-sm py-0" style={{ fontSize: '0.75rem' }}>
                        + Add Project
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="col-12 col-md-2">
            {/* Assignee Input */}
            <input 
              type="text" 
              className="form-control form-control-sm border-0" 
              placeholder="👤 Assign to..." 
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              onBlur={handleAssigneeBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAssigneeBlur(); }}
              style={{ fontSize: '0.85rem', outline: 'none', background: 'transparent', color: 'var(--text-main)', padding: '0.45rem 0.65rem' }}
            />
          </div>

          <div className="col-12 col-md-2 d-flex align-items-center justify-content-between justify-content-md-end gap-3 mt-2 mt-md-0">
            <div className="tracker-time font-monospace" style={{ color: 'var(--text-main)' }}>
              {state.activeTimer ? formatSeconds(elapsed) : '0:00:00'}
            </div>
            <button 
              className={`btn btn-sm px-4 fw-bold ${state.activeTimer ? 'btn-danger' : 'btn-primary'}`} 
              onClick={handleStartStop}
            >
              {state.activeTimer ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* Left Column: Logged Entries list */}
        <div className="col-lg-8">
          <h5 className="fw-semibold text-muted mb-3" style={{ fontSize: '0.9rem' }}>Time Logs</h5>
          {sortedDates.length === 0 ? (
            <div className="card p-5 text-center text-muted shadow-sm">
              <span className="fs-3 mb-2">⏱️</span>
              No tracked hours found. Start the timer above to log your first work task!
            </div>
          ) : (
            sortedDates.map(dateStr => (
              <div key={dateStr} className="mb-4">
                <div className="fw-bold text-muted mb-2 px-2" style={{ fontSize: '0.85rem' }}>{dateStr}</div>
                <div className="card shadow-sm border p-0 overflow-hidden">
                  <div className="list-group list-group-flush">
                    {groups[dateStr].map(e => {
                      const entryProj = state.projects.find(p => p.id === e.projectId);
                      const durSec = e.end ? Math.max(0, Math.floor((new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000)) : 0;
                      
                      return (
                        <div key={e.id} className="list-group-item d-flex align-items-center justify-content-between py-2 px-3 gap-2" style={{ background: 'var(--bg-card)', color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
                          <div className="d-flex align-items-center gap-3 col-6">
                            <span className="fw-semibold" style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{e.description}</span>
                            {entryProj && (
                              <span className="d-inline-flex align-items-center gap-1 badge border py-1 px-2" style={{ fontSize: '0.75rem', background: 'var(--primary-light)', color: 'var(--primary-color)' }}>
                                <span className="color-dot" style={{ backgroundColor: entryProj.color, width: '6px', height: '6px' }}></span>
                                <span>{entryProj.name}</span>
                              </span>
                            )}
                            {e.assignee && (
                              <span className="badge border px-2" style={{ fontSize: '0.75rem', fontWeight: 'normal', background: 'var(--bg-app)', color: 'var(--text-muted)' }}>
                                👤 {e.assignee}
                              </span>
                            )}
                          </div>

                          <div className="d-flex align-items-center gap-4 col-4 justify-content-end text-end">
                            <div className="small" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDateTime(e.start)} {e.end ? '— ' + new Date(e.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '– Running'}</div>
                            <div className="fw-bold font-monospace" style={{ fontSize: '0.875rem', color: 'var(--text-main)' }}>{formatSeconds(durSec)}</div>
                            <button 
                              className="btn btn-link text-danger p-0" 
                              onClick={() => handleDeleteEntry(e.id)}
                              style={{ textDecoration: 'none' }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Mini Dashboard Charts */}
        <div className="col-lg-4">
          <h5 className="fw-semibold text-muted mb-3" style={{ fontSize: '0.9rem' }}>Analytics</h5>
          
          {/* Today's Distribution Pie Chart */}
          <div className="card p-3 shadow-sm mb-4">
            <h6 className="fw-bold mb-3" style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>Today's Distribution (Hours)</h6>
            {pieData.length === 0 ? (
              <div className="text-center py-5 text-muted small">
                No hours logged today to render allocation chart.
              </div>
            ) : (
              <div style={{ maxHeight: '200px', display: 'flex', justifyContent: 'center' }}>
                <Pie 
                  data={pieChartData} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
                  }} 
                />
              </div>
            )}
          </div>

          {/* Weekly Work Hours Bar Chart */}
          <div className="card p-3 shadow-sm">
            <h6 className="fw-bold mb-3" style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>Weekly Work Summary (Hours)</h6>
            <div style={{ height: '180px' }}>
              <Bar 
                data={barChartData} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { y: { beginAtZero: true, grid: { color: 'var(--border-color)' }, ticks: { font: { size: 9 }, color: 'var(--text-muted)' } }, x: { ticks: { font: { size: 9 }, color: 'var(--text-muted)' } } },
                  plugins: { legend: { display: false } }
                }} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
