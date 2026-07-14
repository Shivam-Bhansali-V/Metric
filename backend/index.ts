import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import https from 'https';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:5173',
      'http://localhost:4173',
      'https://metric-frontend-kohl.vercel.app'
    ];
    if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-User-Id'],
  credentials: false
}));
app.use(express.json({ limit: '100kb' })); // Cap payload size

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Token Validation Helper
function validateGoogleToken(token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error_description) {
            reject(new Error(parsed.error_description));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Helper function to return full state matching frontend expectations
async function getFullState(userId?: string) {
  let ws = await prisma.workspace.findUnique({ where: { id: 'default' } });
  if (!ws) {
    ws = await prisma.workspace.create({
      data: {
        id: 'default',
        name: 'My Workspace',
        currency: 'USD',
        hourlyRate: 0.0
      }
    });
  }

  if (!userId) {
    return {
      workspace: { name: ws.name, currency: ws.currency, hourlyRate: ws.hourlyRate },
      clients: [],
      projects: [],
      tags: [],
      reminders: [],
      timeEntries: [],
      activeTimer: null
    };
  }

  const clients = await prisma.client.findMany();
  const projects = await prisma.project.findMany({
    where: { OR: [ { userId }, { userId: null } ] }
  });
  const tags = await prisma.tag.findMany();
  const reminders = await prisma.reminder.findMany({
    where: { userId },
    orderBy: { scheduledAt: 'asc' }
  });

  const completedEntries = await prisma.timeEntry.findMany({
    where: { userId, NOT: { end: null } },
    orderBy: { start: 'desc' },
    include: { tags: true }
  });

  const activeEntry = await prisma.timeEntry.findFirst({
    where: { userId, end: null },
    include: { tags: true }
  });

  return {
    workspace: {
      name: ws.name,
      currency: ws.currency,
      hourlyRate: ws.hourlyRate
    },
    clients: clients.map(c => ({ id: c.id, name: c.name })),
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      clientId: p.clientId || '',
      color: p.color,
      billable: p.billable,
      rate: p.rate
    })),
    tags: tags.map(t => ({ id: t.id, name: t.name })),
    reminders: reminders.map(r => ({
      id: r.id,
      description: r.description,
      projectId: r.projectId || '',
      assignee: r.assignee || '',
      scheduledAt: r.scheduledAt.toISOString(),
      triggered: r.triggered
    })),
    timeEntries: completedEntries.map(e => ({
      id: e.id,
      description: e.description,
      projectId: e.projectId,
      tagIds: e.tags.map(t => t.tagId),
      billable: e.billable,
      start: e.start.toISOString(),
      end: e.end ? e.end.toISOString() : null,
      assignee: e.assignee || ''
    })),
    activeTimer: activeEntry ? {
      id: activeEntry.id,
      description: activeEntry.description,
      projectId: activeEntry.projectId,
      tagIds: activeEntry.tags.map(t => t.tagId),
      billable: activeEntry.billable,
      start: activeEntry.start.toISOString(),
      end: null,
      assignee: activeEntry.assignee || ''
    } : null
  };
}

// Global Auth Filter Middleware for API routes
app.use('/api', async (req, res, next) => {
  // Allow login, check-username, and registration endpoints without auth
  if (
    req.path === '/auth/google-login' ||
    req.path === '/users/check-username' ||
    req.path === '/auth/register'
  ) {
    return next();
  }

  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: Missing User ID' });
  }

  const user = await prisma.userProfile.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: User not registered' });
  }

  (req as any).user = user;
  next();
});

// Authentication & Registration Endpoints
app.post('/api/auth/google-login', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const payload = await validateGoogleToken(token);
    
    // Verify audience matches our Client ID to prevent token replay
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(400).json({ error: 'Invalid token audience' });
    }

    const userProfile = await prisma.userProfile.findUnique({
      where: { id: payload.sub }
    });

    if (userProfile) {
      res.json({ success: true, user: userProfile });
    } else {
      res.json({
        success: false,
        registrationRequired: true,
        sub: payload.sub,
        email: payload.email
      });
    }
  } catch (error: any) {
    console.error('Google login error:', error);
    res.status(500).json({ error: error.message || 'Failed to authenticate with Google' });
  }
});

app.get('/api/users/check-username', async (req, res) => {
  try {
    // Accept both ?q= (registration) and ?username= (assignee lookup)
    const raw = (req.query.username as string || req.query.q as string || '').trim().toLowerCase();
    if (!raw || raw.length < 2) {
      return res.json({ available: false, error: 'Too short' });
    }

    const exists = await prisma.userProfile.findUnique({
      where: { username: raw }
    });

    res.json({ available: !exists });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to verify username' });
  }
});

app.get('/api/users/search', async (req, res) => {
  try {
    const raw = (req.query.q as string || '').trim().toLowerCase();
    if (!raw) {
      return res.json([]);
    }

    const matches = await prisma.userProfile.findMany({
      where: {
        username: {
          contains: raw,
          mode: 'insensitive'
        }
      },
      select: {
        username: true
      },
      take: 10
    });

    res.json(matches.map(m => m.username));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to search usernames' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { sub, email, username } = req.body;
    const cleanUsername = (username || '').trim().toLowerCase();

    if (!sub || !email || !cleanUsername) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const exists = await prisma.userProfile.findUnique({
      where: { username: cleanUsername }
    });

    if (exists) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const newUser = await prisma.userProfile.create({
      data: {
        id: sub,
        email,
        username: cleanUsername
      }
    });

    res.json({ success: true, user: newUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register profile' });
  }
});

// REST Endpoints
app.get('/api/state', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const state = await getFullState(userId);
    res.json(state);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch state' });
  }
});

app.put('/api/workspace', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { name, currency, hourlyRate } = req.body;
    await prisma.workspace.upsert({
      where: { id: 'default' },
      update: { name, currency, hourlyRate },
      create: { id: 'default', name, currency, hourlyRate }
    });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

app.post('/api/timer/start', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { description, projectId, tagIds, billable, start, assignee } = req.body;
    
    // Stop any currently running timers first for this user
    await prisma.timeEntry.updateMany({
      where: { userId, end: null },
      data: { end: new Date() }
    });

    const entryId = 'e_' + crypto.randomBytes(4).toString('hex');
    await prisma.timeEntry.create({
      data: {
        id: entryId,
        description: description || '',
        projectId: projectId || null,
        billable: billable !== undefined ? billable : true,
        start: start ? new Date(start) : new Date(),
        end: null,
        assignee: assignee || null,
        userId,
        tags: {
          create: (tagIds || []).map((tId: string) => ({
            tag: { connect: { id: tId } }
          }))
        }
      }
    });

    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to start timer' });
  }
});

app.post('/api/timer/stop', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { description, projectId, tagIds, billable, assignee } = req.body;
    const active = await prisma.timeEntry.findFirst({ where: { userId, end: null } });
    if (active) {
      // Delete old tags relation for this entry before re-creating
      await prisma.timeEntryTag.deleteMany({ where: { timeEntryId: active.id } });

      await prisma.timeEntry.update({
        where: { id: active.id },
        data: {
          description: description || '(no description)',
          projectId: projectId || null,
          billable: billable !== undefined ? billable : true,
          end: new Date(),
          assignee: assignee || active.assignee,
          tags: {
            create: (tagIds || []).map((tId: string) => ({
              tag: { connect: { id: tId } }
            }))
          }
        }
      });
    }
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to stop timer' });
  }
});

app.post('/api/timer/update', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { description, projectId, tagIds, billable, assignee } = req.body;
    const active = await prisma.timeEntry.findFirst({ where: { userId, end: null } });
    if (active) {
      const updateData: any = {};
      if (description !== undefined) updateData.description = description;
      if (projectId !== undefined) updateData.projectId = projectId || null;
      if (billable !== undefined) updateData.billable = billable;
      if (assignee !== undefined) updateData.assignee = assignee || null;

      if (tagIds !== undefined) {
        await prisma.timeEntryTag.deleteMany({ where: { timeEntryId: active.id } });
        updateData.tags = {
          create: tagIds.map((tId: string) => ({
            tag: { connect: { id: tId } }
          }))
        };
      }

      await prisma.timeEntry.update({
        where: { id: active.id },
        data: updateData
      });
    }
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update active timer' });
  }
});

app.post('/api/time-entries', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { description, projectId, tagIds, billable, start, end, assignee } = req.body;
    const entryId = 'e_' + crypto.randomBytes(4).toString('hex');
    await prisma.timeEntry.create({
      data: {
        id: entryId,
        description: description || '',
        projectId: projectId || null,
        billable: billable !== undefined ? billable : true,
        start: new Date(start),
        end: new Date(end),
        assignee: assignee || null,
        userId,
        tags: {
          create: (tagIds || []).map((tId: string) => ({
            tag: { connect: { id: tId } }
          }))
        }
      }
    });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add time entry' });
  }
});

app.put('/api/time-entries/:id', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { description, projectId, tagIds, billable, start, end, assignee } = req.body;
    
    // Ensure the log belongs to the user
    const check = await prisma.timeEntry.findFirst({ where: { id, userId } });
    if (!check) return res.status(403).json({ error: 'Forbidden' });

    const updateData: any = {};
    if (description !== undefined) updateData.description = description;
    if (projectId !== undefined) updateData.projectId = projectId || null;
    if (billable !== undefined) updateData.billable = billable;
    if (start !== undefined) updateData.start = new Date(start);
    if (end !== undefined) updateData.end = new Date(end);
    if (assignee !== undefined) updateData.assignee = assignee || null;

    if (tagIds !== undefined) {
      await prisma.timeEntryTag.deleteMany({ where: { timeEntryId: id } });
      updateData.tags = {
        create: tagIds.map((tId: string) => ({
          tag: { connect: { id: tId } }
        }))
      };
    }

    await prisma.timeEntry.update({
      where: { id },
      data: updateData
    });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

app.delete('/api/time-entries/:id', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const check = await prisma.timeEntry.findFirst({ where: { id, userId } });
    if (!check) return res.status(403).json({ error: 'Forbidden' });

    await prisma.timeEntry.delete({ where: { id } });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { name, clientId, color, billable, rate } = req.body;
    const projectId = 'p_' + crypto.randomBytes(4).toString('hex');
    await prisma.project.create({
      data: {
        id: projectId,
        name,
        clientId: clientId || null,
        color: color || '#ccc',
        billable: billable !== undefined ? billable : true,
        rate: rate || 0.0,
        userId
      }
    });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const check = await prisma.project.findFirst({ where: { id, userId } });
    if (!check) return res.status(403).json({ error: 'Forbidden' });

    await prisma.project.delete({ where: { id } });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Reminders Endpoints
app.post('/api/reminders', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { description, notes, projectId, assignee, scheduledAt } = req.body;
    const reminderId = 'r_' + crypto.randomBytes(4).toString('hex');
    await prisma.reminder.create({
      data: {
        id: reminderId,
        description: description || '',
        notes: notes || null,
        projectId: projectId || null,
        assignee: assignee || null,
        scheduledAt: new Date(scheduledAt),
        triggered: false,
        userId
      }
    });

    // If assignee username exists, create a notification for them
    if (assignee && assignee.trim()) {
      const assigneeUser = await prisma.userProfile.findUnique({
        where: { username: assignee.trim().toLowerCase() }
      });
      if (assigneeUser && assigneeUser.id !== userId) {
        const senderUser = await prisma.userProfile.findUnique({ where: { id: userId } });
        const senderName = senderUser?.username || 'Someone';
        const scheduledDate = new Date(scheduledAt).toLocaleString('en-IN', {
          dateStyle: 'medium', timeStyle: 'short'
        });
        await prisma.notification.create({
          data: {
            id: 'n_' + crypto.randomBytes(6).toString('hex'),
            recipientId: assigneeUser.id,
            senderId: userId,
            message: `@${senderName} assigned you a task: "${description}" — scheduled at ${scheduledDate}`
          }
        });
      }
    }

    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

app.put('/api/reminders/:id/trigger', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const check = await prisma.reminder.findFirst({ where: { id, userId } });
    if (!check) return res.status(403).json({ error: 'Forbidden' });

    await prisma.reminder.update({
      where: { id },
      data: { triggered: true }
    });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to trigger reminder' });
  }
});

app.delete('/api/reminders/:id', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const check = await prisma.reminder.findFirst({ where: { id, userId } });
    if (!check) return res.status(403).json({ error: 'Forbidden' });

    await prisma.reminder.delete({ where: { id } });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

app.post('/api/workspace/reset', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    await prisma.reminder.deleteMany({ where: { userId } });
    await prisma.timeEntryTag.deleteMany({ where: { timeEntry: { userId } } });
    await prisma.timeEntry.deleteMany({ where: { userId } });
    await prisma.project.deleteMany({ where: { userId } });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset workspace' });
  }
});

// ── Notification Endpoints ────────────────────────────────
app.get('/api/notifications', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const notifs = await prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(notifs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const check = await prisma.notification.findFirst({ where: { id, recipientId: userId } });
    if (!check) return res.status(403).json({ error: 'Forbidden' });
    await prisma.notification.update({ where: { id }, data: { read: true } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

app.put('/api/notifications/read-all', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    await prisma.notification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

app.listen(PORT, () => {
  console.log(`Clockify-Lite Node/Express Server running on port ${PORT}`);
});
