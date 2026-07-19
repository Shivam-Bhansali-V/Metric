import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import https from 'https';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// Explicit CORS allowlist — no wildcards
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow server-to-server
    const allowed = [
      'http://localhost:5173',
      'http://localhost:4173',
      'https://metric-frontend-kohl.vercel.app'
    ];
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin '${origin}' is not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-User-Id'],
  credentials: false
}));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in 15 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Slow down.' }
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
app.use(express.json({ limit: '100kb' })); // Cap payload size

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
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
  let ws: any = null;
  if (userId) {
    ws = await prisma.workspace.findUnique({ where: { userId } });
    if (!ws) {
      const wsId = 'w_' + crypto.randomBytes(4).toString('hex');
      ws = await prisma.workspace.create({
        data: {
          id: wsId,
          name: 'My Workspace',
          currency: 'USD',
          hourlyRate: 0.0,
          userId
        }
      });
    }
  } else {
    ws = { name: 'My Workspace', currency: 'USD', hourlyRate: 0.0 };
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

  const clients = await prisma.client.findMany({
    where: { userId }
  });
  const projects = await prisma.project.findMany({
    where: { OR: [ { userId }, { userId: null } ] }
  });
  const tags = await prisma.tag.findMany({
    where: { userId }
  });
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
      isPaused: activeEntry.isPaused,
      accumulatedTime: activeEntry.accumulatedTime,
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

  // Define a custom property on request to avoid any
  Object.assign(req, { user });
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
      where: { userId },
      update: { name, currency, hourlyRate },
      create: { 
        id: 'w_' + crypto.randomBytes(4).toString('hex'), 
        name, 
        currency, 
        hourlyRate, 
        userId 
      }
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
        accumulatedTime: 0,
        isPaused: false,
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

app.post('/api/timer/pause', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const active = await prisma.timeEntry.findFirst({ where: { userId, end: null } });
    if (active && !active.isPaused) {
      const elapsedSinceStart = Math.max(0, Math.floor((Date.now() - new Date(active.start).getTime()) / 1000));
      const totalAccumulated = active.accumulatedTime + elapsedSinceStart;

      await prisma.timeEntry.update({
        where: { id: active.id },
        data: {
          isPaused: true,
          accumulatedTime: totalAccumulated
        }
      });
    }
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to pause timer' });
  }
});

app.post('/api/timer/resume', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const active = await prisma.timeEntry.findFirst({ where: { userId, end: null } });
    if (active && active.isPaused) {
      await prisma.timeEntry.update({
        where: { id: active.id },
        data: {
          isPaused: false,
          start: new Date() // Reset start anchor for next ticking period
        }
      });
    }
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to resume timer' });
  }
});

app.post('/api/timer/stop', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { description, projectId, tagIds, billable, assignee } = req.body;
    const active = await prisma.timeEntry.findFirst({ where: { userId, end: null } });
    if (active) {
      let finalElapsed = active.accumulatedTime;
      if (!active.isPaused) {
        finalElapsed += Math.max(0, Math.floor((Date.now() - new Date(active.start).getTime()) / 1000));
      }

      const stopTime = new Date();
      const startTimeAdjusted = new Date(stopTime.getTime() - finalElapsed * 1000);

      // Delete old tags relation for this entry before re-creating
      await prisma.timeEntryTag.deleteMany({ where: { timeEntryId: active.id } });

      await prisma.timeEntry.update({
        where: { id: active.id },
        data: {
          description: description || '(no description)',
          projectId: projectId || null,
          billable: billable !== undefined ? billable : true,
          start: startTimeAdjusted,
          end: stopTime,
          isPaused: false,
          accumulatedTime: finalElapsed,
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

app.put('/api/projects/:id', async (req: express.Request & { user?: { id: string } }, res: express.Response) => {
  try {
    const userId = req.user?.id || (req as any).user.id;
    const { id } = req.params;
    const { name, clientId, color, billable, rate } = req.body;

    const check = await prisma.project.findFirst({ where: { id, userId } });
    if (!check) return res.status(403).json({ error: 'Forbidden' });

    await prisma.project.update({
      where: { id },
      data: {
        name,
        clientId: clientId || null,
        color: color || '#ccc',
        billable: billable !== undefined ? billable : true,
        rate: rate !== undefined ? rate : 0.0,
      }
    });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update project' });
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

app.post('/api/clients', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const clientId = 'c_' + crypto.randomBytes(4).toString('hex');
    await prisma.client.create({
      data: { id: clientId, name, userId }
    });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const check = await prisma.client.findFirst({ where: { id, userId } });
    if (!check) return res.status(403).json({ error: 'Forbidden' });
    await prisma.client.delete({ where: { id } });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

app.post('/api/tags', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const tagId = 't_' + crypto.randomBytes(4).toString('hex');
    await prisma.tag.create({
      data: { id: tagId, name, userId }
    });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

app.delete('/api/tags/:id', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const check = await prisma.tag.findFirst({ where: { id, userId } });
    if (!check) return res.status(403).json({ error: 'Forbidden' });
    await prisma.tag.delete({ where: { id } });
    res.json(await getFullState(userId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete tag' });
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

    // Require explicit confirmation token to prevent accidental/CSRF data wipes
    if (req.body?.confirm !== 'RESET') {
      return res.status(400).json({ error: 'Confirmation required. Send { confirm: "RESET" } in the request body.' });
    }

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



// Public Client Portal Endpoint (No Authentication Required)
app.get('/api/portal/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        timeEntries: {
          where: { NOT: { end: null } },
          orderBy: { start: 'desc' }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found or portal disabled' });
    }

    const totalDurationSecs = project.timeEntries.reduce((sum, e) => {
      if (!e.end) return sum;
      return sum + Math.max(0, Math.floor((new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000));
    }, 0);

    res.json({
      name: project.name,
      color: project.color,
      rate: project.rate,
      billable: project.billable,
      totalHours: Number((totalDurationSecs / 3600).toFixed(2)),
      timeEntries: project.timeEntries.map(e => ({
        id: e.id,
        description: e.description,
        start: e.start,
        end: e.end,
        billable: e.billable,
        assignee: e.assignee
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve client portal data' });
  }
});

app.listen(PORT, () => {
  console.log(`Clockify-Lite Node/Express Server running on port ${PORT}`);
});
