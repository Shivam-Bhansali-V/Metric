import type { Notification } from '../types';

interface NotificationDrawerProps {
  open: boolean;
  notifications: Notification[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export default function NotificationDrawer({ open, notifications, onClose, onMarkRead, onMarkAllRead }: NotificationDrawerProps) {
  const unreadCount = notifications.filter(n => !n.read).length;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <>
      {/* Backdrop */}
      <div className={`notif-overlay ${open ? 'active' : ''}`} onClick={onClose} />

      {/* Slide-in drawer */}
      <div className={`notif-drawer ${open ? 'open' : ''}`}>
        <div className="notif-drawer-header">
          <div>
            <h6 className="fw-bold mb-0" style={{ color: 'var(--text-main)' }}>
              Notifications
              {unreadCount > 0 && (
                <span className="ms-2 badge rounded-pill" style={{ background: 'var(--primary-color)', fontSize: '0.65rem' }}>
                  {unreadCount} new
                </span>
              )}
            </h6>
          </div>
          <div className="d-flex gap-2 align-items-center">
            {unreadCount > 0 && (
              <button
                className="btn btn-sm"
                onClick={onMarkAllRead}
                style={{ fontSize: '0.75rem', color: 'var(--primary-color)', background: 'none', border: 'none', padding: 0 }}
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem' }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="notif-drawer-body">
          {notifications.length === 0 ? (
            <div className="text-center py-5">
              <div style={{ fontSize: '2.5rem' }}>🔔</div>
              <p className="text-muted mt-2 mb-0" style={{ fontSize: '0.85rem' }}>No notifications yet</p>
              <p className="text-muted" style={{ fontSize: '0.78rem' }}>When someone assigns you a task, it'll appear here.</p>
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                className={`notif-item ${n.read ? '' : 'unread'}`}
                onClick={() => !n.read && onMarkRead(n.id)}
                style={{ cursor: n.read ? 'default' : 'pointer' }}
              >
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                      📌 Task Assigned
                    </div>
                    <p className="mb-0" style={{ fontSize: '0.875rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                      {n.message}
                    </p>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatTime(n.createdAt)}
                  </span>
                </div>
                {!n.read && (
                  <div className="mt-1" style={{ fontSize: '0.72rem', color: 'var(--primary-color)' }}>
                    Tap to mark as read
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
