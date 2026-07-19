import { useState } from 'react';
import type { AppState } from '../types';
import { formatSeconds } from '../utils';

interface ProjectsProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  apiCall: (endpoint: string, method: string, body?: any) => Promise<AppState>;
}

export default function Projects({ state, onUpdateState, apiCall }: ProjectsProps) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [rate, setRate] = useState(state.workspace.hourlyRate);
  const [billable, setBillable] = useState(true);
  const [selectedColor, setSelectedColor] = useState('#ff5a5f');

  const projectColors = ['#ff5a5f', '#2ec4b6', '#03a9f4', '#ffb703', '#8338ec', '#fb5607'];

  const projectDurations = state.timeEntries.reduce((acc, e) => {
    const pId = e.projectId || 'none';
    if (e.end) {
      const dur = Math.floor((new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000);
      if (dur > 0) acc[pId] = (acc[pId] || 0) + dur;
    }
    return acc;
  }, {} as Record<string, number>);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Project name is required.");
      return;
    }
    try {
      const newState = await apiCall('/api/projects', 'POST', {
        name: trimmed,
        clientId: clientId || null,
        color: selectedColor,
        billable,
        rate: Number(rate)
      });
      setShowModal(false);
      setName('');
      setClientId('');
      setRate(state.workspace.hourlyRate);
      setBillable(true);
      setSelectedColor('#ff5a5f');
      onUpdateState(newState);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this project?")) {
      try {
        const newState = await apiCall(`/api/projects/${id}`, 'DELETE');
        onUpdateState(newState);
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="h3 fw-bold mb-0">Projects</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Create New Project</button>
      </div>

      {state.projects.length === 0 ? (
        <div className="card shadow-sm border-0 bg-white text-center py-5 d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '300px', borderRadius: 'var(--border-radius-md)' }}>
          <div className="mb-3 d-flex align-items-center justify-content-center" style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h5 className="fw-bold mb-2" style={{ color: 'var(--text-main)' }}>No projects found</h5>
          <p className="small mb-4" style={{ maxWidth: '300px', color: 'var(--text-muted)' }}>Get started by creating a project to organize your time entries and generate accurate reports.</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Create New Project</button>
        </div>
      ) : (
        <div className="card shadow-sm border p-0 overflow-hidden bg-white">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.9rem' }}>
              <thead className="table-light text-muted uppercase">
                <tr>
                  <th style={{ paddingLeft: '1.5rem', fontWeight: 600 }}>Project Name</th>
                  <th style={{ fontWeight: 600 }}>Client</th>
                  <th style={{ fontWeight: 600 }}>Tracked Time</th>
                  <th style={{ fontWeight: 600 }}>Hourly Rate</th>
                  <th style={{ fontWeight: 600 }}>Billable</th>
                  <th style={{ paddingRight: '1.5rem', textAlign: 'right', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.projects.map(p => {
                  const client = state.clients.find(c => c.id === p.clientId);
                  const secs = projectDurations[p.id] || 0;
                  return (
                    <tr key={p.id} style={{ borderLeft: `4px solid ${p.color || '#cbd5e1'} !important` }}>
                      <td style={{ paddingLeft: '1.5rem' }} className="fw-semibold text-dark">
                        <div className="d-flex align-items-center gap-2">
                          <span className="color-dot" style={{ backgroundColor: p.color }}></span>
                          <span>{p.name}</span>
                        </div>
                      </td>
                      <td>{client ? client.name : '-'}</td>
                      <td className="fw-bold">{formatSeconds(secs)}</td>
                      <td>${p.rate}/h</td>
                      <td className={p.billable ? 'text-success fw-bold' : 'text-muted'}>{p.billable ? '$' : '-'}</td>
                      <td style={{ paddingRight: '1.5rem', textAlign: 'right' }}>
                        <button className="btn btn-outline-danger btn-sm py-1" onClick={() => handleDelete(p.id)}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal fade show" tabIndex={-1} style={{ display: 'block', backgroundColor: 'rgba(33,37,41,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '480px' }}>
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header border-bottom">
                <h5 className="modal-title fw-bold text-dark">Create New Project</h5>
                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              
              <div className="modal-body d-flex flex-column gap-3 py-4">
                <div>
                  <label className="form-label text-muted fw-semibold small mb-1">Project Name</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Enter project name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label text-muted fw-semibold small mb-1">Client</label>
                  <select 
                    className="form-select" 
                    value={clientId} 
                    onChange={(e) => setClientId(e.target.value)}
                  >
                    <option value="">No Client</option>
                    {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="form-label text-muted fw-semibold small mb-1">Hourly Rate ($)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={rate} 
                    onChange={(e) => setRate(Number(e.target.value))}
                  />
                </div>

                <div className="form-check form-switch d-flex justify-content-between align-items-center p-0">
                  <label className="form-check-label text-muted fw-semibold small">Billable by default</label>
                  <input 
                    className="form-check-input ms-0" 
                    type="checkbox" 
                    checked={billable}
                    onChange={(e) => setBillable(e.target.checked)}
                    style={{ cursor: 'pointer', width: '36px', height: '18px' }}
                  />
                </div>

                <div>
                  <label className="form-label text-muted fw-semibold small mb-2 d-block">Color Theme</label>
                  <div className="d-flex gap-2">
                    {projectColors.map(color => (
                      <span 
                        key={color}
                        className="color-dot" 
                        onClick={() => setSelectedColor(color)}
                        style={{ 
                          backgroundColor: color, 
                          width: '22px', 
                          height: '22px', 
                          cursor: 'pointer', 
                          borderRadius: '50%',
                          boxShadow: selectedColor === color ? '0 0 0 2px #fff, 0 0 0 4px #212529' : 'none'
                        }}
                      ></span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer border-top bg-light">
                <button type="button" className="btn btn-outline-secondary btn-sm px-3" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm px-4" onClick={handleCreate}>Create Project</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
