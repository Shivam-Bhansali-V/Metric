import { useEffect, useState } from 'react';
import { formatSeconds, formatDateTime } from '../utils';

interface TimeEntry {
  id: string;
  description: string;
  start: string;
  end: string;
  billable: boolean;
  assignee?: string;
}

interface ProjectPortalData {
  name: string;
  color: string;
  rate: number;
  billable: boolean;
  totalHours: number;
  timeEntries: TimeEntry[];
}

export default function ClientPortal({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/portal/${projectId}`);
        if (!res.ok) throw new Error('Portal project not found or access disabled');
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || 'Failed to load client portal');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-vh-100 d-flex flex-column align-items-center justify-content-center" style={{ backgroundColor: 'var(--bg-app)' }}>
        <div className="spinner-border text-primary mb-3" role="status"></div>
        <span className="text-muted">Loading secure client portal...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-vh-100 d-flex flex-column align-items-center justify-content-center p-4 text-center" style={{ backgroundColor: 'var(--bg-app)' }}>
        <div className="card shadow-sm border p-4" style={{ maxWidth: '400px', background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <h4 className="fw-bold mb-3" style={{ color: 'var(--text-main)' }}>Access Denied</h4>
          <p className="text-muted small">{error || 'This client portal link is inactive or invalid.'}</p>
          <a href="#" className="btn btn-primary btn-sm mt-2">Return Home</a>
        </div>
      </div>
    );
  }

  const earnings = data.totalHours * data.rate;

  return (
    <div className="min-vh-100 py-5 px-4" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}>
      <div className="container" style={{ maxWidth: '800px' }}>
        
        {/* Top Header Card */}
        <div className="card shadow-sm border p-4 mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="d-flex align-items-center gap-3 mb-2">
            <span className="color-dot" style={{ backgroundColor: data.color, width: '12px', height: '12px' }}></span>
            <h2 className="fw-bold m-0" style={{ fontSize: '1.5rem' }}>{data.name}</h2>
            <span className="badge border py-1 px-2" style={{ fontSize: '0.75rem', background: 'var(--primary-light)', color: 'var(--primary-color)' }}>
              Client Share Portal
            </span>
          </div>
          <p className="text-muted small mb-0">Real-time transparency portal for project logs and billable totals.</p>
        </div>

        {/* Totals Section */}
        <div className="row g-3 mb-4">
          <div className="col-6 col-md-4">
            <div className="card border p-3 shadow-sm text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <span className="text-muted small fw-semibold">Tracked Hours</span>
              <h3 className="fw-bold mt-1 text-primary">{data.totalHours.toFixed(2)}h</h3>
            </div>
          </div>
          {data.billable && (
            <>
              <div className="col-6 col-md-4">
                <div className="card border p-3 shadow-sm text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                  <span className="text-muted small fw-semibold">Hourly Rate</span>
                  <h3 className="fw-bold mt-1 text-success">${data.rate.toFixed(2)}/h</h3>
                </div>
              </div>
              <div className="col-12 col-md-4">
                <div className="card border p-3 shadow-sm text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                  <span className="text-muted small fw-semibold">Estimated Total</span>
                  <h3 className="fw-bold mt-1 text-success">${earnings.toFixed(2)}</h3>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Task Log List */}
        <div className="card border shadow-sm p-0 overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="p-3 border-bottom d-flex align-items-center justify-content-between">
            <h5 className="fw-bold m-0" style={{ fontSize: '0.95rem' }}>Completed Time Logs</h5>
            <span className="text-muted small">{data.timeEntries.length} entries total</span>
          </div>
          <div className="list-group list-group-flush">
            {data.timeEntries.length === 0 ? (
              <div className="text-center py-5 text-muted small">No logs have been finalized for this project yet.</div>
            ) : (
              data.timeEntries.map(e => {
                const durSec = e.end ? Math.max(0, Math.floor((new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000)) : 0;
                return (
                  <div key={e.id} className="list-group-item d-flex align-items-center justify-content-between py-3 px-4 gap-2 border-bottom" style={{ background: 'var(--bg-card)', borderBottomColor: 'var(--border-color)', color: 'var(--text-main)' }}>
                    <div className="d-flex align-items-center gap-3">
                      <span className="fw-semibold" style={{ fontSize: '0.9rem' }}>{e.description}</span>
                      {e.assignee && (
                        <span className="badge border px-2" style={{ fontSize: '0.7rem', fontWeight: 'normal', background: 'var(--primary-light)', color: 'var(--primary-color)' }}>
                          {e.assignee}
                        </span>
                      )}
                    </div>
                    <div className="d-flex align-items-center gap-4">
                      <div className="small text-muted" style={{ fontSize: '0.8rem' }}>
                        {formatDateTime(e.start)} {e.end ? '— ' + new Date(e.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                      <div className="fw-bold font-monospace" style={{ fontSize: '0.875rem' }}>{formatSeconds(durSec)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
