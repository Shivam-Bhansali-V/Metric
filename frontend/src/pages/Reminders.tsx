import { useState, useEffect, useRef } from 'react';
import type { AppState, Reminder } from '../types';
import { formatDateTime } from '../utils';

interface RemindersProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  apiCall: (endpoint: string, method: string, body?: any) => Promise<any>;
}

type AssigneeStatus = 'idle' | 'checking' | 'found' | 'not_found';

export default function Reminders({ state, onUpdateState, apiCall }: RemindersProps) {
  const [desc, setDesc] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [assigneeStatus, setAssigneeStatus] = useState<AssigneeStatus>('idle');
  const [assigneeInfo, setAssigneeInfo] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounced username existence check & suggestions search ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = assignee.trim();
    if (!trimmed) {
      setAssigneeStatus('idle');
      setAssigneeInfo('');
      setSuggestions([]);
      return;
    }
    setAssigneeStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const [checkData, searchData] = await Promise.all([
          apiCall(`/api/users/check-username?username=${encodeURIComponent(trimmed)}`, 'GET'),
          apiCall(`/api/users/search?q=${encodeURIComponent(trimmed)}`, 'GET')
        ]);
        
        if (!checkData.available) {
          setAssigneeStatus('found');
          setAssigneeInfo(`✓ @${trimmed} found`);
        } else {
          setAssigneeStatus('not_found');
          setAssigneeInfo(`✗ @${trimmed} not found`);
        }

        setSuggestions(searchData.filter((name: string) => name.toLowerCase() !== trimmed.toLowerCase()));
      } catch {
        setAssigneeStatus('idle');
      }
    }, 400);
  }, [assignee]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim() || !scheduledAt) return;
    if (assignee.trim() && assigneeStatus !== 'found') return;

    setSubmitting(true);
    try {
      const newState = await apiCall('/api/reminders', 'POST', {
        description: desc,
        notes: notes || null,
        projectId: projectId || null,
        assignee: assignee.trim() || null,
        scheduledAt: new Date(scheduledAt).toISOString()
      });
      onUpdateState(newState);
      setDesc('');
      setNotes('');
      setProjectId('');
      setAssignee('');
      setScheduledAt('');
      setAssigneeStatus('idle');
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this scheduled task?')) {
      try {
        const newState = await apiCall(`/api/reminders/${id}`, 'DELETE');
        onUpdateState(newState);
      } catch (err) { console.error(err); }
    }
  };


  const isFormValid = desc.trim() && scheduledAt && (!assignee.trim() || assigneeStatus === 'found');

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="h3 fw-bold mb-0" style={{ color: 'var(--text-main)' }}>Task Scheduler</h2>
          <p className="text-muted mb-0 mt-1" style={{ fontSize: '0.875rem' }}>Set reminders, add notes, and assign tasks to teammates</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="badge rounded-pill" style={{ background: 'var(--primary-light)', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.8rem', padding: '6px 12px' }}>
            {state.reminders.filter(r => !r.triggered).length} pending
          </span>
        </div>
      </div>

      {/* ── Create Task Form ─────────────────────── */}
      <div className="card p-0 mb-4 overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
        <div className="px-4 py-3 border-bottom" style={{ background: 'var(--primary-light)' }}>
          <h6 className="fw-bold mb-0" style={{ color: 'var(--primary-color)' }}>📌 Schedule a New Task</h6>
        </div>
        <div className="p-4">
          <form onSubmit={handleAdd}>
            {/* Row 1: Title + Schedule Time */}
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label fw-semibold" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Task Title <span style={{ color: 'var(--danger-color)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Code Review, System Deployment"
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Remind At <span style={{ color: 'var(--danger-color)' }}>*</span>
                </label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Project
                </label>
                <select
                  className="form-select"
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                >
                  <option value="">No Project</option>
                  {state.projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Description textarea + Assignee */}
            <div className="row g-3 mb-4">
              <div className="col-md-8">
                <label className="form-label fw-semibold" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Description / Notes
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Add any extra context, instructions, or details about this task…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ resize: 'vertical', minHeight: '80px' }}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Assign to (username)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Type @username to assign"
                    value={assignee}
                    onChange={e => {
                      setAssignee(e.target.value.replace('@', ''));
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    style={{
                      borderColor: assigneeStatus === 'found' ? 'var(--success-color)' : assigneeStatus === 'not_found' ? 'var(--danger-color)' : undefined
                    }}
                  />
                  {/* Suggestions list dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="list-group position-absolute w-100 shadow-lg" style={{ zIndex: 1000, top: '100%', left: 0, maxHeight: '160px', overflowY: 'auto' }}>
                      {suggestions.map(s => (
                        <button
                          key={s}
                          type="button"
                          className="list-group-item list-group-item-action text-start py-2 px-3 d-flex align-items-center gap-2"
                          style={{ fontSize: '0.85rem' }}
                          onClick={() => {
                            setAssignee(s);
                            setAssigneeStatus('found');
                            setAssigneeInfo(`✓ @${s} found`);
                            setSuggestions([]);
                            setShowSuggestions(false);
                          }}
                        >
                          👤 @{s}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Live status indicator */}
                  {assigneeStatus !== 'idle' && (
                    <div className="mt-1 d-flex align-items-center gap-1" style={{ fontSize: '0.78rem', fontWeight: 500 }}>
                      {assigneeStatus === 'checking' && (
                        <><span className="spinner-border spinner-border-sm" style={{ width: '10px', height: '10px', borderWidth: '2px', color: 'var(--text-muted)' }}></span>
                        <span style={{ color: 'var(--text-muted)' }}>Checking…</span></>
                      )}
                      {assigneeStatus === 'found' && (
                        <span style={{ color: 'var(--success-color)' }}>{assigneeInfo} — will be notified</span>
                      )}
                      {assigneeStatus === 'not_found' && (
                        <span style={{ color: 'var(--danger-color)' }}>{assigneeInfo}</span>
                      )}
                    </div>
                  )}
                  {assigneeStatus === 'idle' && assignee === '' && (
                    <div className="mt-1" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      They will receive an in-app notification
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="d-flex justify-content-end">
              <button
                type="submit"
                className="btn btn-primary px-4"
                disabled={!isFormValid || submitting}
              >
                {submitting
                  ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></span>Scheduling…</>
                  : '📅 Schedule Task'
                }
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Task List ────────────────────────────── */}
      <div className="card p-0 overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
        <div className="px-4 py-3 border-bottom d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0" style={{ color: 'var(--text-main)' }}>📋 Scheduled Tasks</h6>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{state.reminders.length} total</span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="ps-4 py-3" style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Task</th>
                <th className="py-3" style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</th>
                <th className="py-3" style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignee</th>
                <th className="py-3" style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scheduled At</th>
                <th className="py-3" style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                <th className="pe-4 py-3 text-end" style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.reminders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-5 text-muted">
                    <div style={{ fontSize: '2rem' }}>📭</div>
                    <div className="mt-1">No tasks scheduled yet. Create one above!</div>
                  </td>
                </tr>
              ) : (
                state.reminders.map((r: Reminder) => {
                  const proj = state.projects.find(p => p.id === r.projectId);
                  const isPast = new Date(r.scheduledAt).getTime() < Date.now();
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="ps-4 py-3">
                        <div className="fw-semibold" style={{ color: 'var(--text-main)' }}>{r.description}</div>
                        {r.notes && (
                          <div className="mt-1" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                            {r.notes.length > 80 ? r.notes.slice(0, 80) + '…' : r.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3">
                        {proj ? (
                          <div className="d-flex align-items-center gap-1">
                            <span className="color-dot" style={{ backgroundColor: proj.color, display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }}></span>
                            <span style={{ color: 'var(--text-main)' }}>{proj.name}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="py-3">
                        {r.assignee ? (
                          <span className="badge px-2 py-1 fw-normal" style={{ background: 'var(--primary-light)', color: 'var(--primary-color)', fontSize: '0.8rem', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20 }}>
                            👤 @{r.assignee}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="py-3" style={{ color: 'var(--text-muted)' }}>
                        {formatDateTime(r.scheduledAt)}
                      </td>
                      <td className="py-3">
                        {r.triggered ? (
                          <span className="badge px-2 py-1" style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', borderRadius: 20 }}>
                            ✓ Triggered
                          </span>
                        ) : isPast ? (
                          <span className="badge px-2 py-1" style={{ fontSize: '0.72rem', background: '#fef3f2', color: '#e53e3e', border: '1px solid #fecaca', borderRadius: 20 }}>
                            ⚠ Overdue
                          </span>
                        ) : (
                          <span className="badge px-2 py-1" style={{ fontSize: '0.72rem', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: 20 }}>
                            ⏳ Pending
                          </span>
                        )}
                      </td>
                      <td className="pe-4 py-3 text-end">
                        <button
                          className="btn btn-sm"
                          onClick={() => handleDelete(r.id)}
                          title="Delete Task"
                          style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: 6, padding: '3px 10px' }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
