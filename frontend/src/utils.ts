import type { AppState } from './types';

/** Format seconds into HH:MM:SS string */
export function formatSeconds(secs: number): string {
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Format ISO date string for display in log tables */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today at ${timePart}`;
  const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
  if (isTomorrow) return `Tomorrow at ${timePart}`;
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** Look up a project + its client from app state. Returns a safe default if not found. */
export function getProjectInfo(state: AppState, projectId: string | null) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) {
    return { id: '', name: 'No Project', color: '#ccc', clientName: '', rate: state.workspace.hourlyRate, billable: true };
  }
  const client = state.clients.find(c => c.id === project.clientId);
  return { ...project, clientName: client ? client.name : '' };
}

/** Sanitize a user-facing string: strip HTML tags to prevent XSS display */
export function sanitizeText(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}
