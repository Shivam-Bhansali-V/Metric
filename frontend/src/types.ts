export interface Workspace {
  name: string;
  currency: string;
  hourlyRate: number;
}

export interface Client {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  color: string;
  billable: boolean;
  rate: number;
}

export interface Tag {
  id: string;
  name: string;
}

export interface TimeEntry {
  id: string;
  description: string;
  projectId: string | null;
  tagIds: string[];
  billable: boolean;
  start: string;
  end: string | null;
  accumulatedTime?: number;
  isPaused?: boolean;
  assignee?: string;
}

export interface Reminder {
  id: string;
  description: string;
  notes?: string;
  projectId: string;
  assignee: string;
  scheduledAt: string;
  triggered: boolean;
}

export interface Notification {
  id: string;
  message: string;
  read: boolean;
  createdAt: string;
  senderId: string;
}

export interface AppState {
  workspace: Workspace;
  clients: Client[];
  projects: Project[];
  tags: Tag[];
  timeEntries: TimeEntry[];
  activeTimer: TimeEntry | null;
  reminders: Reminder[];
}
