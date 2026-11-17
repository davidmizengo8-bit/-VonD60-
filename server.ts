import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { loadStore, saveStore } from './server/store';
import { calculateAcseeGrade } from './src/utils/acsee';
import { scoreWrittenAnswerLocally } from './src/utils/offline';
import type {
  ActiveExamSession,
  AppPerformanceSummary,
  ArenaRoom,
  ChatMessage,
  ClassGroup,
  CommunityGroup,
  EmailDispatchLog,
  ErrorReport,
  ExamAttempt,
  ExamItem,
  ImageAdItem,
  LibraryResource,
  QuestionResult,
  StoreState,
  Subject,
  UserProfile,
} from './src/types';

const PORT = 3000;
const OWNER_ADMIN_EMAIL = (process.env.ADMIN_OWNER_EMAIL || 'davidmizengo8@gmail.com').trim().toLowerCase();
const OWNER_HMAC_SECRET = crypto
  .createHash('sha256')
  .update(process.env.GEMINI_API_KEY || 'elimu-fasta-owner-secret-key')
  .digest('hex');

function hashPasskey(passkey: string): string {
  return crypto.createHash('sha256').update(`ef-owner:${passkey}`).digest('hex');
}

function issueAdminToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', OWNER_HMAC_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminToken(req: express.Request): boolean {
  const token = String(req.headers['x-admin-token'] || '');
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', OWNER_HMAC_SECRET).update(payload).digest('base64url');
  if (sig.length !== expectedSig.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    return String(parsed.email || '').toLowerCase() === OWNER_ADMIN_EMAIL;
  } catch {
    return false;
  }
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

let store = loadStore();

function getSanitizedConfig(isOwnerAdmin = false) {
  const rawCfg = store.config as any;
  const { adminPasskeyHash, ...rest } = rawCfg;
  const hasResendConfigured = Boolean((process.env.RESEND_API_KEY || '').trim());
  return {
    ...rest,
    hasAdminPasskey: Boolean(adminPasskeyHash),
    hasEmailTransport: hasResendConfigured,
    ...(isOwnerAdmin ? { adminOwnerEmail: OWNER_ADMIN_EMAIL } : {}),
  };
}

function getSanitizedUsers(isOwnerAdmin = false) {
  return store.users.map((u) => {
    if (u.role === 'admin' && !isOwnerAdmin) {
      return {
        ...u,
        email: 'restricted@owner',
        phone: 'Restricted',
      };
    }
    return u;
  });
}

function getTeacherStudentUsernames(currentStore: StoreState, teacher: UserProfile): Set<string> {
  const studentUsernames = new Set<string>();
  const teacherClasses = currentStore.classes.filter(
    (c) =>
      c.teacherUsername === teacher.username ||
      (teacher.classCode && c.classCode.toUpperCase() === teacher.classCode.toUpperCase())
  );
  const teacherClassCodes = new Set<string>(
    teacherClasses.map((c) => c.classCode.toUpperCase())
  );
  if (teacher.classCode) {
    teacherClassCodes.add(teacher.classCode.toUpperCase());
  }
  for (const cls of teacherClasses) {
    for (const uname of cls.memberUsernames) {
      const member = currentStore.users.find((u) => u.username === uname);
      if (member?.role === 'student') {
        studentUsernames.add(member.username);
      }
    }
  }
  for (const u of currentStore.users) {
    if (u.role === 'student' && u.classCode && teacherClassCodes.has(u.classCode.toUpperCase())) {
      studentUsernames.add(u.username);
    }
  }
  return studentUsernames;
}

function resolveViewerUser(req: express.Request, isOwnerAdmin: boolean): UserProfile | null {
  const requested = String(req.headers['x-active-user'] || req.query.viewer || '').trim().toLowerCase();
  if (isOwnerAdmin && (!requested || requested === 'admin_elimu')) {
    const adminUser = store.users.find((u) => u.role === 'admin');
    if (adminUser) return adminUser;
  }
  const matched = store.users.find((u) => u.username.toLowerCase() === requested);
  if (matched) {
    if (matched.role === 'admin') {
      if (isOwnerAdmin) return matched;
    } else {
      return matched;
    }
  }
  return store.users.find((u) => u.role !== 'admin') || null;
}

function canViewerAccessResource(
  currentStore: StoreState,
  resItem: LibraryResource,
  viewer: UserProfile | null,
  isOwnerAdmin: boolean
): boolean {
  // Teacher videos & public/store resources are open to all students & users across the app
  if (resItem.tier !== 'teachers_exclusive') {
    return true;
  }
  if (isOwnerAdmin) return true;
  if (!viewer) return false;
  if (viewer.role === 'teacher') {
    // Teachers see their own exclusive uploads and materials in classes they manage
    if (resItem.uploadedBy === viewer.username) return true;
    const teacherClasses = currentStore.classes.filter(
      (c) =>
        c.teacherUsername === viewer.username ||
        (viewer.classCode && c.classCode.toUpperCase() === viewer.classCode.toUpperCase())
    );
    const teacherCodes = new Set(teacherClasses.map((c) => c.classCode.toUpperCase()));
    if (viewer.classCode) teacherCodes.add(viewer.classCode.toUpperCase());
    if (resItem.classCode && teacherCodes.has(resItem.classCode.toUpperCase())) return true;
    return false;
  }
  if (viewer.role === 'student') {
    // Exclusive teacher materials are visible ONLY to students in that teacher's class/cohort
    if (
      resItem.classCode &&
      viewer.classCode &&
      resItem.classCode.toUpperCase() === viewer.classCode.toUpperCase()
    ) {
      return true;
    }
    const matchingClass = currentStore.classes.find(
      (c) =>
        (c.teacherUsername === resItem.uploadedBy ||
          (resItem.classCode && c.classCode.toUpperCase() === resItem.classCode.toUpperCase())) &&
        c.memberUsernames.includes(viewer.username)
    );
    return Boolean(matchingClass);
  }
  return false;
}

const pendingAdminOtps = new Map<string, { code: string; expiresAt: number }>();

async function sendEmailViaResend(
  recipients: string[],
  subject: string,
  text: string
): Promise<boolean> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey || recipients.length === 0) return false;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Elimu Fasta <onboarding@resend.dev>',
        to: recipients,
        subject,
        text,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function computeAppPerformance(currentStore: StoreState, liveSessionsCount: number): AppPerformanceSummary {
  const totalAttempts = currentStore.attempts.length;
  const releasedAttempts = currentStore.attempts.filter((a) => a.status === 'released').length;
  const pendingReviewAttempts = currentStore.attempts.filter((a) => a.status === 'pending_review').length;

  const overallAveragePct = totalAttempts
    ? Math.round(currentStore.attempts.reduce((s, a) => s + a.percentage, 0) / totalAttempts)
    : 0;
  const overallPassRatePct = totalAttempts
    ? Math.round((currentStore.attempts.filter((a) => a.percentage >= 40).length / totalAttempts) * 100)
    : 0;

  const subjectStats: AppPerformanceSummary['subjectStats'] = (['Physics', 'Mathematics'] as Subject[]).map(
    (subject) => {
      const subAttempts = currentStore.attempts.filter((a) => a.subject === subject);
      const count = subAttempts.length;
      return {
        subject,
        attemptsCount: count,
        averagePct: count ? Math.round(subAttempts.reduce((s, a) => s + a.percentage, 0) / count) : 0,
        passRatePct: count
          ? Math.round((subAttempts.filter((a) => a.percentage >= 40).length / count) * 100)
          : 0,
      };
    }
  );

  const grades: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'S' | 'F'> = ['A', 'B', 'C', 'D', 'E', 'S', 'F'];
  const gradeDistribution = grades.map((grade) => ({
    grade,
    count: currentStore.attempts.filter((a) => a.acseeGrade === grade).length,
  }));

  const schoolCohorts = currentStore.classes.map((cls) => {
    const cohortStudents = currentStore.users.filter(
      (u) =>
        u.role === 'student' &&
        (u.classCode.toUpperCase() === cls.classCode.toUpperCase() || cls.memberUsernames.includes(u.username))
    );
    const cohortSet = new Set(cohortStudents.map((s) => s.username));
    const cohortAttempts = currentStore.attempts.filter(
      (a) => cohortSet.has(a.studentUsername) || a.classCode.toUpperCase() === cls.classCode.toUpperCase()
    );
    const avg = cohortAttempts.length
      ? Math.round(cohortAttempts.reduce((s, a) => s + a.percentage, 0) / cohortAttempts.length)
      : 0;
    return {
      schoolName: cls.school,
      classCode: cls.classCode,
      studentCount: cohortStudents.length,
      attemptsCount: cohortAttempts.length,
      averagePct: avg,
    };
  });

  return {
    totalUsers: currentStore.users.length,
    roleCounts: {
      students: currentStore.users.filter((u) => u.role === 'student').length,
      teachers: currentStore.users.filter((u) => u.role === 'teacher').length,
      parents: currentStore.users.filter((u) => u.role === 'parent').length,
      admin: currentStore.users.filter((u) => u.role === 'admin').length,
    },
    totalClasses: currentStore.classes.length,
    totalExams: currentStore.exams.length,
    totalResources: currentStore.resources.length,
    liveExamSittingCount: liveSessionsCount,
    totalAttempts,
    releasedAttempts,
    pendingReviewAttempts,
    overallAveragePct,
    overallPassRatePct,
    subjectStats,
    gradeDistribution,
    schoolCohorts,
    errorHealth: {
      open: currentStore.errorReports.filter((r) => r.status === 'open').length,
      aiDiagnosed: currentStore.errorReports.filter((r) => r.status === 'ai_diagnosed').length,
      resolved: currentStore.errorReports.filter((r) => r.status === 'resolved').length,
    },
    competitionCount: currentStore.exams.filter((e) => e.competitionScope && e.competitionScope !== 'individual').length,
  };
}

// Real-time server-authoritative state
const activeExamSessions = new Map<string, ActiveExamSession>();
const arenaRooms = new Map<string, ArenaRoom>();
const wsClients = new Set<WebSocket>();

function broadcast(event: string, payload: unknown) {
  const msg = JSON.stringify({ event, payload });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function getActiveSessionsList(): ActiveExamSession[] {
  const now = Date.now();
  for (const [id, sess] of activeExamSessions.entries()) {
    if (now > sess.expiresAt + 60_000) {
      activeExamSessions.delete(id);
    }
  }
  return Array.from(activeExamSessions.values());
}

function getWeekKey(): string {
  const d = new Date();
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.send(
      JSON.stringify({
        event: 'init',
        payload: {
          activeSessions: getActiveSessionsList(),
          arenas: Array.from(arenaRooms.values()),
        },
      })
    );

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as { event: string; payload: any };
        if (data.event === 'chat:send') {
          const {
            roomId,
            senderUsername,
            senderName,
            text,
            replyToId,
            replyPreview,
            attachmentName,
            attachmentDataUrl,
            attachmentType,
          } = data.payload;
          const hasAttachment = Boolean(attachmentDataUrl || attachmentName);
          if (!roomId || !senderUsername || (!String(text || '').trim() && !hasAttachment)) return;
          const msg: ChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            roomId,
            senderUsername,
            senderName: senderName || senderUsername,
            text: String(text || '').trim(),
            replyToId: replyToId ? String(replyToId) : undefined,
            replyPreview: replyPreview ? String(replyPreview).slice(0, 120) : undefined,
            attachmentName: attachmentName ? String(attachmentName) : undefined,
            attachmentDataUrl: attachmentDataUrl ? String(attachmentDataUrl) : undefined,
            attachmentType: attachmentType === 'image' ? 'image' : attachmentType === 'file' ? 'file' : undefined,
            status: 'delivered',
            createdAt: new Date().toISOString(),
          };
          store.messages.push(msg);
          saveStore(store);
          broadcast('chat:message', msg);
        } else if (data.event === 'arena:create') {
          const { examId, hostUsername, hostName } = data.payload;
          const exam = store.exams.find((e) => e.id === examId) || store.exams[0];
          if (!exam) return;
          const code = `DUEL-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const room: ArenaRoom = {
            code,
            examId: exam.id,
            examTitle: exam.title,
            subject: exam.subject,
            hostUsername,
            hostName,
            hostProgress: 0,
            guestProgress: 0,
            status: 'waiting',
          };
          arenaRooms.set(code, room);
          broadcast('arena:update', Array.from(arenaRooms.values()));
        } else if (data.event === 'arena:join') {
          const { code, guestUsername, guestName } = data.payload;
          const room = arenaRooms.get(String(code).toUpperCase());
          if (!room || room.status !== 'waiting' || room.hostUsername === guestUsername) return;
          room.guestUsername = guestUsername;
          room.guestName = guestName;
          room.status = 'active';
          room.startedAt = Date.now();
          broadcast('arena:update', Array.from(arenaRooms.values()));
        } else if (data.event === 'arena:progress') {
          const { code, username, progress } = data.payload;
          const room = arenaRooms.get(code);
          if (!room) return;
          if (room.hostUsername === username) room.hostProgress = progress;
          if (room.guestUsername === username) room.guestProgress = progress;
          broadcast('arena:update', Array.from(arenaRooms.values()));
        } else if (data.event === 'arena:finish') {
          const { code, username, score } = data.payload;
          const room = arenaRooms.get(code);
          if (!room) return;
          if (room.hostUsername === username) {
            room.hostScore = score;
            room.hostProgress = 100;
          }
          if (room.guestUsername === username) {
            room.guestScore = score;
            room.guestProgress = 100;
          }
          if (room.hostScore !== undefined && room.guestScore !== undefined) {
            room.status = 'finished';
          }
          broadcast('arena:update', Array.from(arenaRooms.values()));
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      wsClients.delete(ws);
    });
  });

  // --- Core State ---
  app.get('/api/state', (req, res) => {
    const isOwnerAdmin = verifyAdminToken(req);
    const viewer = resolveViewerUser(req, isOwnerAdmin);
    const allLiveSessions = getActiveSessionsList();

    let scopedAttempts: ExamAttempt[] = [];
    let scopedSessions: ActiveExamSession[] = [];
    let appPerformance: AppPerformanceSummary | undefined;

    if (!viewer) {
      scopedAttempts = [];
      scopedSessions = [];
    } else if (viewer.role === 'admin' && isOwnerAdmin) {
      // Admin views aggregated general app performance rather than individual candidate scripts
      scopedAttempts = [];
      scopedSessions = [];
      appPerformance = computeAppPerformance(store, allLiveSessions.length);
    } else if (viewer.role === 'teacher') {
      const myStudents = getTeacherStudentUsernames(store, viewer);
      scopedAttempts = store.attempts.filter((a) => myStudents.has(a.studentUsername));
      scopedSessions = allLiveSessions.filter((s) => myStudents.has(s.studentUsername));
    } else if (viewer.role === 'parent') {
      scopedAttempts = viewer.connectedChildUsername
        ? store.attempts.filter((a) => a.studentUsername === viewer.connectedChildUsername)
        : [];
      scopedSessions = [];
    } else {
      // Student sees ONLY his/her own results
      scopedAttempts = store.attempts.filter((a) => a.studentUsername === viewer.username);
      scopedSessions = [];
    }

    const scopedResources = store.resources.filter((r) =>
      canViewerAccessResource(store, r, viewer, isOwnerAdmin)
    );

    res.json({
      ...store,
      config: getSanitizedConfig(isOwnerAdmin),
      users: getSanitizedUsers(isOwnerAdmin),
      attempts: scopedAttempts,
      resources: scopedResources,
      emailDispatches: isOwnerAdmin ? store.emailDispatches || [] : [],
      appPerformance,
      isAdminVerified: isOwnerAdmin,
      activeSessions: scopedSessions,
      arenas: Array.from(arenaRooms.values()),
    });
  });

  // --- Auth & Profile ---
  app.post('/api/auth/signup', (req, res) => {
    const {
      realName,
      username,
      role = 'student',
      className,
      classCode,
      phone,
      schoolName,
      email,
      profilePhoto = '',
      region,
      connectedChildUsername,
    } = req.body;

    if (role === 'admin') {
      return res.status(403).json({
        error: 'Admin registration is disabled. Only the platform owner may access the Admin account.',
      });
    }
    if (String(email || '').trim().toLowerCase() === OWNER_ADMIN_EMAIL) {
      return res.status(403).json({
        error: 'This email is reserved for the platform owner Admin login.',
      });
    }
    const safeRole = role === 'teacher' || role === 'parent' ? role : 'student';

    if (!realName || !username || !email || !schoolName) {
      return res.status(400).json({ error: 'Real name, username, email, and school name are required.' });
    }
    const cleanUsername = String(username).trim().toLowerCase().replace(/\s+/g, '_');
    const existing = store.users.find((u) => u.username === cleanUsername);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists. Please sign in or pick another.' });
    }

    const newUser: UserProfile = {
      id: `u-${Date.now()}`,
      realName: String(realName).trim(),
      username: cleanUsername,
      role: safeRole,
      className: className || 'Form VI PCM',
      classCode: classCode || 'PCM-2026',
      phone: phone || '+255700000000',
      schoolName: String(schoolName).trim(),
      email: String(email).trim(),
      profilePhoto,
      region: region || 'Dar es Salaam',
      friends: [],
      likedExamIds: [],
      savedExamIds: [],
      sharedCount: 0,
      purchasedSerials: [],
      unlockedGifts: [],
      connectedChildUsername:
        safeRole === 'parent' ? String(connectedChildUsername || '').trim() || undefined : undefined,
    };
    store.users.push(newUser);

    // Auto-join matching class if exists
    const cls = store.classes.find((c) => c.classCode.toUpperCase() === newUser.classCode.toUpperCase());
    if (cls && !cls.memberUsernames.includes(newUser.username)) {
      cls.memberUsernames.push(newUser.username);
    }

    saveStore(store);
    res.json({ user: newUser });
  });

  app.post('/api/auth/admin-request-code', async (req, res) => {
    const { email, passkey } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanEmail !== OWNER_ADMIN_EMAIL) {
      return res.status(403).json({
        error: 'Access Denied: Only the authorized platform owner email address can request Admin verification.',
      });
    }
    const savedHash = (store.config as any).adminPasskeyHash as string | undefined;
    if (savedHash && (!passkey || hashPasskey(String(passkey)) !== savedHash)) {
      return res.status(403).json({
        error: 'Invalid Owner Admin Passkey.',
      });
    }
    const code = String(crypto.randomInt(100000, 999999));
    pendingAdminOtps.set(cleanEmail, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const deliveredViaResend = await sendEmailViaResend(
      [OWNER_ADMIN_EMAIL],
      `${store.config.appName} Admin Verification Code`,
      `Your Owner Admin email verification code is: ${code}\n\nThis code expires in 10 minutes.`
    );

    if (!deliveredViaResend) {
      console.log(`[OWNER EMAIL VERIFICATION] ${OWNER_ADMIN_EMAIL} -> Code: ${code}`);
    }

    res.json({
      ok: true,
      email: OWNER_ADMIN_EMAIL,
      deliveryMode: deliveredViaResend ? 'email' : 'local_preview',
      ...(deliveredViaResend ? {} : { previewCode: code }),
      expiresInSeconds: 600,
    });
  });

  app.post('/api/auth/admin-verify-code', (req, res) => {
    const { email, code, passkey } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanEmail !== OWNER_ADMIN_EMAIL) {
      return res.status(403).json({
        error: 'Access Denied: Only the authorized platform owner email address can sign in as Admin.',
      });
    }
    const savedHash = (store.config as any).adminPasskeyHash as string | undefined;
    if (savedHash && (!passkey || hashPasskey(String(passkey)) !== savedHash)) {
      return res.status(403).json({ error: 'Invalid Owner Admin Passkey.' });
    }
    const entry = pendingAdminOtps.get(cleanEmail);
    if (!entry || Date.now() > entry.expiresAt) {
      return res.status(400).json({ error: 'Verification code expired. Request a new code to your owner email.' });
    }
    if (String(code || '').trim() !== entry.code) {
      return res.status(403).json({ error: 'Incorrect email verification code.' });
    }
    pendingAdminOtps.delete(cleanEmail);
    const adminUser = store.users.find((u) => u.username === 'admin_elimu' && u.role === 'admin');
    if (!adminUser) {
      return res.status(404).json({ error: 'Owner Admin account not initialized.' });
    }
    const adminToken = issueAdminToken(cleanEmail);
    res.json({ user: adminUser, adminToken, verifiedVia: 'email_otp' });
  });

  app.post('/api/auth/admin-login', (req, res) => {
    const { email, passkey } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanEmail !== OWNER_ADMIN_EMAIL) {
      return res.status(403).json({
        error: 'Access Denied: Only the authorized platform owner account can sign in as Admin.',
      });
    }
    const savedHash = (store.config as any).adminPasskeyHash as string | undefined;
    if (savedHash) {
      if (!passkey || hashPasskey(String(passkey)) !== savedHash) {
        return res.status(403).json({
          error: 'Invalid Owner Admin Passkey.',
        });
      }
    }
    const adminUser = store.users.find((u) => u.username === 'admin_elimu' && u.role === 'admin');
    if (!adminUser) {
      return res.status(404).json({ error: 'Owner Admin account not initialized.' });
    }
    const adminToken = issueAdminToken(cleanEmail);
    res.json({ user: adminUser, adminToken, verifiedVia: 'email' });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username } = req.body;
    const user = store.users.find((u) => u.username.toLowerCase() === String(username || '').trim().toLowerCase());
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (user.role === 'admin') {
      return res.status(403).json({
        error: 'Admin login requires Owner Verification.',
      });
    }
    res.json({ user });
  });

  app.post('/api/users/friend', (req, res) => {
    const { username, targetUsername } = req.body;
    const user = store.users.find((u) => u.username === username);
    const target = store.users.find((u) => u.username === targetUsername);
    if (!user || !target || username === targetUsername) {
      return res.status(400).json({ error: 'Invalid friend request.' });
    }
    if (!user.friends.includes(targetUsername)) user.friends.push(targetUsername);
    if (!target.friends.includes(username)) target.friends.push(username);
    saveStore(store);
    res.json({ user });
  });

  // --- Classes & Competitions ---
  app.post('/api/classes', (req, res) => {
    const { name, school, adminPhone, teacherUsername } = req.body;
    if (!name || !school || !adminPhone || !teacherUsername) {
      return res.status(400).json({ error: 'Class name, school, admin phone number, and creator account are required.' });
    }
    const code = `${String(name).replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newClass: ClassGroup = {
      id: `cls-${Date.now()}`,
      name,
      school,
      adminPhone,
      classCode: code,
      teacherUsername: String(teacherUsername),
      memberUsernames: [String(teacherUsername)],
      createdAt: new Date().toISOString(),
    };
    const creator = store.users.find((u) => u.username === teacherUsername);
    if (creator && creator.role === 'teacher' && !creator.classCode) {
      creator.classCode = code;
      creator.className = name;
    }
    store.classes.push(newClass);
    saveStore(store);
    res.json({ classGroup: newClass });
  });

  app.post('/api/classes/join', (req, res) => {
    const { username, classCode } = req.body;
    const cls = store.classes.find((c) => c.classCode.toUpperCase() === String(classCode || '').trim().toUpperCase());
    const user = store.users.find((u) => u.username === username);
    if (!cls || !user) {
      return res.status(404).json({ error: 'Class code not found.' });
    }
    user.classCode = cls.classCode;
    user.className = cls.name;
    user.schoolName = cls.school;
    if (!cls.memberUsernames.includes(user.username)) {
      cls.memberUsernames.push(user.username);
    }
    saveStore(store);
    res.json({ classGroup: cls, user });
  });

  app.post('/api/competitions/create', (req, res) => {
    const { examId, scope, role } = req.body;
    if (role === 'admin' && !verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Verified owner Admin session required.' });
    }
    if (role !== 'teacher' && role !== 'admin') {
      return res.status(403).json({ error: 'Only teachers or admins can generate official competition codes.' });
    }
    const exam = store.exams.find((e) => e.id === examId);
    if (!exam) return res.status(404).json({ error: 'Selected ACSEE exam not found.' });
    const prefix = scope === 'school_to_school' ? 'SCH' : 'CLS';
    const code = `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    exam.competitionScope = scope === 'school_to_school' ? 'school_to_school' : 'class_to_class';
    exam.competitionCode = code;
    exam.joinedParticipants = exam.joinedParticipants || [
      scope === 'school_to_school' ? exam.schoolName : exam.classCode || 'PCM-2026',
    ];
    store.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: `Competition Code Created: ${code}`,
      body: `${exam.subject} (${exam.paperCode}) open for ${
        exam.competitionScope === 'school_to_school' ? 'School-to-School' : 'Class-to-Class'
      } competition.`,
      category: 'exam',
      emailDigestSent: false,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    broadcast('notification:new', store.notifications[0]);
    res.json({ exam, code });
  });

  app.post('/api/competitions/join', (req, res) => {
    const { code, username } = req.body;
    const cleanCode = String(code || '').trim().toUpperCase();
    const exam = store.exams.find((e) => e.competitionCode?.toUpperCase() === cleanCode);
    const user = store.users.find((u) => u.username === username);
    if (!exam || !user) {
      return res.status(404).json({ error: 'Competition code not found.' });
    }
    const participantLabel =
      exam.competitionScope === 'school_to_school'
        ? user.schoolName
        : `${user.className} (${user.classCode})`;
    exam.joinedParticipants = exam.joinedParticipants || [];
    if (!exam.joinedParticipants.includes(participantLabel)) {
      exam.joinedParticipants.push(participantLabel);
    }
    saveStore(store);
    res.json({ exam, participantLabel });
  });

  // --- Exams & Past Papers (Physics & Math Only) ---
  app.post('/api/exams', (req, res) => {
    const {
      title,
      subject,
      paperCode,
      kind,
      creatorUsername,
      creatorName,
      schoolName,
      classCode,
      antiRepetition = false,
      requiresTeacherReview = true,
      competitionScope = 'individual',
      questions,
      attachmentName,
      attachmentDataUrl,
      videoAttachmentUrl,
    } = req.body;

    if (subject !== 'Physics' && subject !== 'Mathematics') {
      return res.status(400).json({ error: 'Elimu Fasta supports Physics and Mathematics exams only.' });
    }
    if (!title || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Exam title and at least one question are required.' });
    }

    const newExam: ExamItem = {
      id: `ex-${Date.now()}`,
      title,
      subject,
      paperCode: paperCode || (subject === 'Physics' ? '131/1' : '142/1'),
      acseeSectionFormat:
        req.body.acseeSectionFormat ||
        (subject === 'Physics'
          ? 'NECTA ACSEE Section A & Section B (3 Hours · 100 Marks)'
          : 'NECTA ACSEE Pure/Applied Mathematics (3 Hours · 100 Marks)'),
      kind: kind || 'past_paper',
      creatorUsername,
      creatorName,
      schoolName,
      classCode,
      durationMinutes: 180, // Strict 3-hour standard
      antiRepetition: Boolean(antiRepetition),
      requiresTeacherReview: Boolean(requiresTeacherReview),
      competitionScope,
      competitionCode:
        competitionScope !== 'individual'
          ? `${competitionScope === 'school_to_school' ? 'SCH' : 'CLS'}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
          : undefined,
      joinedParticipants:
        competitionScope !== 'individual'
          ? [competitionScope === 'school_to_school' ? schoolName : classCode || 'CLASS']
          : undefined,
      likes: 0,
      saves: 0,
      shares: 0,
      createdAt: new Date().toISOString(),
      questions: questions.map((q: any, i: number) => {
        const qType =
          q.questionType === 'short_answer' ||
          q.questionType === 'explanation' ||
          q.questionType === 'proof'
            ? q.questionType
            : 'mcq';
        return {
          id: `q-${Date.now()}-${i}`,
          questionType: qType,
          topic: q.topic || (subject === 'Physics' ? 'Mechanics' : 'Calculus'),
          section: q.section || 'Section A',
          prompt: q.prompt,
          options: qType === 'mcq' && Array.isArray(q.options) ? q.options : [],
          correctIndex: qType === 'mcq' ? Number(q.correctIndex) || 0 : -1,
          expectedAnswer: q.expectedAnswer ? String(q.expectedAnswer).trim() : undefined,
          markingPoints: Array.isArray(q.markingPoints)
            ? q.markingPoints.map((m: any) => String(m).trim()).filter(Boolean)
            : undefined,
          marks: Number(q.marks) || 20,
          explanation: q.explanation || 'Verify via standard ACSEE derivation.',
        };
      }),
      attachmentName,
      attachmentDataUrl: attachmentDataUrl ? String(attachmentDataUrl) : undefined,
      videoAttachmentUrl,
    };
    store.exams.unshift(newExam);
    store.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: `New ${subject} Exam Added: ${title}`,
      body: `Uploaded by ${creatorName} (${schoolName}). Strict 3-hour timed assessment ready.`,
      category: 'exam',
      emailDigestSent: false,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    broadcast('notification:new', store.notifications[0]);
    res.json({ exam: newExam });
  });

  app.post('/api/exams/:id/toggle-anti-rep', (req, res) => {
    const { role } = req.body;
    if (role === 'admin' && !verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Verified owner Admin session required.' });
    }
    if (role !== 'teacher' && role !== 'admin') {
      return res.status(403).json({ error: 'Only teachers or admins can configure the anti-repetition system.' });
    }
    const exam = store.exams.find((e) => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    exam.antiRepetition = !exam.antiRepetition;
    saveStore(store);
    res.json({ exam });
  });

  app.post('/api/exams/:id/react', (req, res) => {
    const { username, action } = req.body;
    const exam = store.exams.find((e) => e.id === req.params.id);
    const user = store.users.find((u) => u.username === username);
    if (!exam || !user) return res.status(404).json({ error: 'Not found.' });

    if (action === 'like') {
      if (user.likedExamIds.includes(exam.id)) {
        user.likedExamIds = user.likedExamIds.filter((id) => id !== exam.id);
        exam.likes = Math.max(0, exam.likes - 1);
      } else {
        user.likedExamIds.push(exam.id);
        exam.likes += 1;
      }
    } else if (action === 'save') {
      if (user.savedExamIds.includes(exam.id)) {
        user.savedExamIds = user.savedExamIds.filter((id) => id !== exam.id);
        exam.saves = Math.max(0, exam.saves - 1);
      } else {
        user.savedExamIds.push(exam.id);
        exam.saves += 1;
      }
    } else if (action === 'share') {
      exam.shares += 1;
      user.sharedCount += 1;
    }
    saveStore(store);
    res.json({ exam, user });
  });

  app.post('/api/exams/:id/start', (req, res) => {
    const { studentUsername, studentName } = req.body;
    const exam = store.exams.find((e) => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    if (exam.antiRepetition) {
      const prior = store.attempts.find(
        (a) => a.examId === exam.id && a.studentUsername === studentUsername
      );
      if (prior) {
        return res.status(403).json({
          error: 'Anti-Repetition System Active: You have already completed this teacher-locked exam.',
        });
      }
    }

    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const session: ActiveExamSession = {
      sessionId,
      examId: exam.id,
      examTitle: exam.title,
      studentUsername,
      studentName,
      startedAt: now,
      expiresAt: now + exam.durationMinutes * 60 * 1000,
    };
    activeExamSessions.set(sessionId, session);
    broadcast('proctor:update', getActiveSessionsList());

    // Anti-repetition shuffles question order per candidate
    const questions = exam.antiRepetition
      ? [...exam.questions].sort(() => Math.random() - 0.5)
      : exam.questions;

    res.json({ session, questions });
  });

  app.post('/api/exams/:id/submit', async (req, res) => {
    const {
      sessionId,
      studentUsername,
      answers = {}, // Record<questionId, selectedIndex>
      writtenAnswers = {}, // Record<questionId, string>
      mode = 'digital',
      forceExpiredTest = false,
    } = req.body;

    const exam = store.exams.find((e) => e.id === req.params.id);
    const user = store.users.find((u) => u.username === studentUsername);
    if (!exam || !user) return res.status(404).json({ error: 'Exam or student not found.' });

    const session = sessionId ? activeExamSessions.get(sessionId) : undefined;
    const now = Date.now();
    if (forceExpiredTest || (session && now > session.expiresAt)) {
      if (sessionId) activeExamSessions.delete(sessionId);
      broadcast('proctor:update', getActiveSessionsList());
      return res.status(403).json({
        error: '3-Hour Time Limit Expired: Submitting is not allowed after the end of time.',
      });
    }

    if (exam.antiRepetition) {
      const prior = store.attempts.find(
        (a) => a.examId === exam.id && a.studentUsername === studentUsername
      );
      if (prior) {
        return res.status(403).json({
          error: 'Anti-Repetition System blocked duplicate submission.',
        });
      }
    }

    const writtenQuestions = exam.questions.filter((q) => (q.questionType || 'mcq') !== 'mcq');
    const aiWrittenMap = new Map<string, { marksAwarded: number; aiFeedback: string }>();

    if (writtenQuestions.length > 0 && process.env.GEMINI_API_KEY) {
      try {
        const rubricItems = writtenQuestions.map((q) => ({
          questionId: q.id,
          questionType: q.questionType,
          prompt: q.prompt,
          maxMarks: q.marks,
          expectedAnswer: q.expectedAnswer || '',
          markingPoints: q.markingPoints || [],
          modelSolution: q.explanation,
          studentAnswer: String(writtenAnswers?.[q.id] || ''),
        }));
        const aiResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `You are grading non-multiple-choice ACSEE ${exam.subject} written solutions, concept explanations, and formal mathematical/physics proofs.
Award partial or full marks strictly out of maxMarks based on markingPoints and expectedAnswer accuracy. If studentAnswer is blank or irrelevant, award 0.
Items to grade: ${JSON.stringify(rubricItems)}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                grades: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      questionId: { type: Type.STRING },
                      marksAwarded: { type: Type.INTEGER },
                      feedback: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });
        const parsed = JSON.parse((aiResp.text ?? '{}').trim());
        for (const item of parsed.grades || []) {
          aiWrittenMap.set(item.questionId, {
            marksAwarded: Number(item.marksAwarded) || 0,
            aiFeedback: String(item.feedback || ''),
          });
        }
      } catch {
        // Fallback to local rubric grader below
      }
    }

    let score = 0;
    let totalMarks = 0;
    const questionResults: QuestionResult[] = exam.questions.map((q) => {
      totalMarks += q.marks;
      const qType = q.questionType || 'mcq';
      if (qType === 'mcq') {
        const selectedIndex = typeof answers?.[q.id] === 'number' ? answers[q.id] : -1;
        const isCorrect = selectedIndex === q.correctIndex;
        const marksAwarded = isCorrect ? q.marks : 0;
        score += marksAwarded;
        return {
          questionId: q.id,
          questionType: qType,
          topic: q.topic,
          selectedIndex,
          correctIndex: q.correctIndex,
          isCorrect,
          marksAwarded,
          maxMarks: q.marks,
        };
      }

      const studentText = String(writtenAnswers?.[q.id] || '');
      const aiGraded = aiWrittenMap.get(q.id);
      const fallback = scoreWrittenAnswerLocally(q, studentText);
      const rawMarks = aiGraded ? aiGraded.marksAwarded : fallback.marksAwarded;
      const marksAwarded = Math.min(q.marks, Math.max(0, Math.round(rawMarks)));
      const isCorrect = marksAwarded >= Math.ceil(q.marks * 0.6);
      const aiFeedback = aiGraded?.aiFeedback || fallback.aiFeedback;
      score += marksAwarded;
      return {
        questionId: q.id,
        questionType: qType,
        topic: q.topic,
        selectedIndex: -1,
        correctIndex: -1,
        writtenAnswer: studentText,
        expectedAnswer: q.expectedAnswer,
        aiFeedback,
        isCorrect,
        marksAwarded,
        maxMarks: q.marks,
      };
    });

    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
    const acsee = calculateAcseeGrade(percentage);
    const elapsedSeconds = session ? Math.max(12, Math.floor((now - session.startedAt) / 1000)) : 600;

    if (sessionId) {
      activeExamSessions.delete(sessionId);
      broadcast('proctor:update', getActiveSessionsList());
    }

    const attempt: ExamAttempt = {
      id: `att-${Date.now()}`,
      examId: exam.id,
      examTitle: exam.title,
      subject: exam.subject,
      studentUsername: user.username,
      studentName: user.realName,
      schoolName: user.schoolName,
      className: user.className,
      classCode: user.classCode,
      mode,
      startedAt: session ? new Date(session.startedAt).toISOString() : new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      elapsedSeconds,
      score,
      totalMarks,
      percentage,
      acseeGrade: acsee.grade,
      acseePoints: acsee.points,
      status: exam.requiresTeacherReview || writtenQuestions.length > 0 ? 'pending_review' : 'released',
      questionResults,
    };

    store.attempts.unshift(attempt);
    saveStore(store);
    res.json({ attempt });
  });

  app.post('/api/attempts/:id/release', (req, res) => {
    const { teacherNote, overrideScore, teacherUsername, questionMarkOverrides } = req.body;
    const isOwnerAdmin = verifyAdminToken(req);
    const requester = String(teacherUsername || req.headers['x-active-user'] || '').trim().toLowerCase();
    const actingTeacher = store.users.find((u) => u.username.toLowerCase() === requester);

    if (!actingTeacher || actingTeacher.role !== 'teacher') {
      return res.status(403).json({
        error: isOwnerAdmin
          ? 'Admin views general app performance only. Only the assigned class teacher releases student scripts.'
          : 'Only the student’s assigned teacher can confirm and release results.',
      });
    }

    const attempt = store.attempts.find((a) => a.id === req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });

    const myStudents = getTeacherStudentUsernames(store, actingTeacher);
    if (!myStudents.has(attempt.studentUsername)) {
      return res.status(403).json({
        error: 'Access Denied: You can only confirm and release results for students in your own classes.',
      });
    }

    if (questionMarkOverrides && typeof questionMarkOverrides === 'object') {
      let updatedTotal = 0;
      attempt.questionResults = attempt.questionResults.map((qr) => {
        const raw = questionMarkOverrides[qr.questionId];
        if (typeof raw === 'number' && !Number.isNaN(raw)) {
          const clamped = Math.min(qr.maxMarks, Math.max(0, Math.round(raw)));
          updatedTotal += clamped;
          return {
            ...qr,
            marksAwarded: clamped,
            isCorrect: clamped >= Math.ceil(qr.maxMarks * 0.6),
          };
        }
        updatedTotal += qr.marksAwarded;
        return qr;
      });
      attempt.score = updatedTotal;
      attempt.percentage = attempt.totalMarks > 0 ? Math.round((updatedTotal / attempt.totalMarks) * 100) : 0;
      const acsee = calculateAcseeGrade(attempt.percentage);
      attempt.acseeGrade = acsee.grade;
      attempt.acseePoints = acsee.points;
    } else if (typeof overrideScore === 'number' && overrideScore >= 0 && overrideScore <= attempt.totalMarks) {
      attempt.score = overrideScore;
      attempt.percentage = Math.round((overrideScore / attempt.totalMarks) * 100);
      const acsee = calculateAcseeGrade(attempt.percentage);
      attempt.acseeGrade = acsee.grade;
      attempt.acseePoints = acsee.points;
    }
    if (teacherNote) attempt.teacherNote = teacherNote;
    attempt.status = 'released';

    store.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: `Results Released: ${attempt.examTitle}`,
      body: `Verified ACSEE grading completed for ${attempt.className}. Candidates can inspect their own scores and Correction Door.`,
      category: 'exam',
      emailDigestSent: false,
      createdAt: new Date().toISOString(),
    });

    saveStore(store);
    broadcast('notification:new', store.notifications[0]);
    res.json({ attempt });
  });

  // --- Library, Store & Luck Wheel ---
  app.post('/api/library', (req, res) => {
    const {
      title,
      subject,
      topic,
      author,
      tier,
      classCode,
      description,
      youtubeUrl,
      videoAttachmentUrl,
      fileName,
      fileDataUrl,
      priceTzs,
      uploadedBy,
      role,
    } = req.body;

    if (role !== 'teacher' && role !== 'admin') {
      return res.status(403).json({ error: 'Only teachers or the platform admin may upload library materials or video lessons.' });
    }
    if (role === 'admin' && !verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Verified owner Admin session required.' });
    }
    if (tier === 'store_paid' && (role !== 'admin' || !verifyAdminToken(req))) {
      return res.status(403).json({ error: 'Only the verified Platform Owner Admin can upload paid Store books.' });
    }
    if (subject !== 'Physics' && subject !== 'Mathematics') {
      return res.status(400).json({ error: 'Only Physics and Mathematics resources are permitted.' });
    }
    if (!String(title || '').trim()) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    const uploader = store.users.find((u) => u.username === uploadedBy);
    const effectiveTier: LibraryResource['tier'] =
      tier === 'teachers_exclusive' || tier === 'teacher_videos_public' || tier === 'store_paid'
        ? tier
        : 'admin_public';
    const resolvedClassCode =
      effectiveTier === 'teachers_exclusive'
        ? String(classCode || uploader?.classCode || '').trim().toUpperCase() || undefined
        : undefined;

    if (effectiveTier === 'teachers_exclusive' && !resolvedClassCode) {
      return res.status(400).json({
        error: 'Class code is required when uploading to your Students Exclusive Library.',
      });
    }

    const coverImage =
      subject === 'Physics'
        ? '/src/assets/images/book_physics_mechanics_1794824910502.jpg'
        : '/src/assets/images/book_pure_math_1794824910469.jpg';

    const newRes: LibraryResource = {
      id: `lib-${Date.now()}`,
      title: String(title).trim(),
      subject,
      topic: topic || 'ACSEE Core Topic',
      author: author || uploader?.realName || uploadedBy,
      tier: effectiveTier,
      classCode: resolvedClassCode,
      schoolName: uploader?.schoolName,
      description: description || 'Uploaded ACSEE study resource.',
      coverImage,
      youtubeUrl: youtubeUrl || '',
      videoAttachmentUrl: videoAttachmentUrl ? String(videoAttachmentUrl).trim() : undefined,
      fileName: fileName || `${String(title).replace(/\s+/g, '_')}.pdf`,
      fileDataUrl: fileDataUrl ? String(fileDataUrl) : undefined,
      priceTzs: effectiveTier === 'store_paid' ? Number(priceTzs) || 10000 : undefined,
      uploadedBy,
      createdAt: new Date().toISOString(),
    };

    store.resources.unshift(newRes);
    store.notifications.unshift({
      id: `notif-${Date.now()}`,
      title:
        effectiveTier === 'teacher_videos_public'
          ? `New Teacher Video (All Students): ${newRes.title}`
          : effectiveTier === 'teachers_exclusive'
            ? `New Class Material (${resolvedClassCode}): ${newRes.title}`
            : `New ${subject} Book Added: ${newRes.title}`,
      body:
        effectiveTier === 'teacher_videos_public'
          ? `Video lesson uploaded by ${newRes.author} — available to all students across the app.`
          : effectiveTier === 'teachers_exclusive'
            ? `Uploaded exclusively for students in class ${resolvedClassCode}.`
            : `${effectiveTier === 'store_paid' ? 'Available in Official Store' : 'Added to In-App Library'}.`,
      category: 'book',
      emailDigestSent: false,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    broadcast('notification:new', store.notifications[0]);
    res.json({ resource: newRes });
  });

  app.post('/api/store/buy', (req, res) => {
    const { username, resourceId } = req.body;
    const user = store.users.find((u) => u.username === username);
    const resource = store.resources.find((r) => r.id === resourceId);
    if (!user || !resource) return res.status(404).json({ error: 'Book or user not found.' });

    const serial = `EF-${Math.floor(1000 + Math.random() * 9000)}-${resource.subject.slice(0, 4).toUpperCase()}`;
    const giftName =
      resource.subject === 'Physics'
        ? 'Exclusive Gift: ACSEE Physics Practicals & Error Tolerance Pack'
        : 'Exclusive Gift: ACSEE Pure Math Formula & Integration Vault';

    user.purchasedSerials.push(serial);
    if (!user.unlockedGifts.includes(giftName)) {
      user.unlockedGifts.push(giftName);
    }
    saveStore(store);
    res.json({ serial, giftName, user });
  });

  app.post('/api/store/redeem', (req, res) => {
    const { username, serial } = req.body;
    const user = store.users.find((u) => u.username === username);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const clean = String(serial || '').trim().toUpperCase();
    if (!clean.startsWith('EF-') || clean.length < 8) {
      return res.status(400).json({ error: 'Invalid Elimu Fasta Serial Number format (expected EF-XXXX-XXXX).' });
    }
    const gift = `Unlocked Gift Pack (${clean})`;
    if (!user.purchasedSerials.includes(clean)) user.purchasedSerials.push(clean);
    if (!user.unlockedGifts.includes(gift)) user.unlockedGifts.push(gift);
    saveStore(store);
    res.json({ gift, user });
  });

  app.post('/api/luck-wheel/spin', (req, res) => {
    const { username } = req.body;
    const user = store.users.find((u) => u.username === username);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const weekKey = getWeekKey();
    if (user.lastWheelSpinWeek === weekKey) {
      return res.status(429).json({
        error: `You have already claimed this week's Luck Wheel spin (${weekKey}). Return next week!`,
      });
    }

    const books = store.resources.filter((r) => r.tier !== 'teachers_exclusive');
    if (books.length === 0) {
      return res.status(400).json({
        error: 'No live books or video packs in the Luck Wheel pool yet. Teachers or Admin can upload materials first.',
      });
    }
    const chosenIndex = Math.floor(Math.random() * books.length);
    const wonBook = books[chosenIndex];
    user.lastWheelSpinWeek = weekKey;
    const giftLabel = `Weekly Luck Wheel Free Book: ${wonBook.title}`;
    if (!user.unlockedGifts.includes(giftLabel)) {
      user.unlockedGifts.push(giftLabel);
    }
    saveStore(store);
    res.json({ wonBook, chosenIndex, totalSlots: books.length, user });
  });

  // --- Communities, Notifications, Errors, Admin Config ---
  app.post('/api/communities', (req, res) => {
    const { name, subject, description, creatorUsername } = req.body;
    if (!name || !creatorUsername) return res.status(400).json({ error: 'Community name required.' });
    const group: CommunityGroup = {
      id: `comm-${Date.now()}`,
      name,
      subject: subject || 'Physics & Math',
      description: description || 'Collaborative ACSEE study circle.',
      creatorUsername,
      members: [creatorUsername],
      createdAt: new Date().toISOString(),
    };
    store.communities.unshift(group);
    saveStore(store);
    res.json({ community: group });
  });

  app.post('/api/communities/:id/join', (req, res) => {
    const { username } = req.body;
    const comm = store.communities.find((c) => c.id === req.params.id);
    if (!comm) return res.status(404).json({ error: 'Community not found.' });
    if (!comm.members.includes(username)) comm.members.push(username);
    saveStore(store);
    res.json({ community: comm });
  });

  app.post('/api/notifications/digest', async (req, res) => {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Only the verified platform owner Admin can confirm and dispatch emails.' });
    }
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ error: 'Admin confirmation checkbox is required before sending emails to all users.' });
    }
    const pending = store.notifications.filter((n) => !n.emailDigestSent);
    store.notifications.forEach((n) => {
      n.emailDigestSent = true;
    });
    const recipientEmails = Array.from(
      new Set(
        store.users
          .map((u) => u.email)
          .filter((e) => Boolean(e) && e.includes('@') && e !== 'restricted@owner')
      )
    );
    const subject = `${store.config.appName} — Platform Digest (${pending.length} Update${pending.length === 1 ? '' : 's'})`;
    const bodyPreview = pending.map((n) => n.title).slice(0, 3).join(' · ') || 'Scheduled member summary email.';
    await sendEmailViaResend(recipientEmails, subject, bodyPreview);

    const dispatch: EmailDispatchLog = {
      id: `ed-${Date.now()}`,
      subject,
      bodyPreview,
      recipientCount: recipientEmails.length,
      recipientEmails,
      confirmedBy: OWNER_ADMIN_EMAIL,
      kind: 'digest',
      sentAt: new Date().toISOString(),
    };
    store.emailDispatches = [dispatch, ...(store.emailDispatches || [])];
    saveStore(store);
    res.json({
      dispatchedCount: pending.length,
      recipientCount: recipientEmails.length,
      dispatch,
      notifications: store.notifications,
    });
  });

  app.post('/api/admin/send-emails', async (req, res) => {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Admin access denied: Only the verified platform owner can confirm and send all-user emails.' });
    }
    const { confirmed, subject, message } = req.body || {};
    if (confirmed !== true) {
      return res.status(400).json({ error: 'Explicit Admin confirmation is required before sending emails to all users.' });
    }
    if (!String(subject || '').trim() || !String(message || '').trim()) {
      return res.status(400).json({ error: 'Email subject and message body are required.' });
    }
    const recipientEmails = Array.from(
      new Set(
        store.users
          .map((u) => u.email)
          .filter((e) => Boolean(e) && e.includes('@') && e !== 'restricted@owner')
      )
    );
    await sendEmailViaResend(recipientEmails, String(subject).trim(), String(message).trim());

    const dispatch: EmailDispatchLog = {
      id: `ed-${Date.now()}`,
      subject: String(subject).trim(),
      bodyPreview: String(message).trim().slice(0, 180),
      recipientCount: recipientEmails.length,
      recipientEmails,
      confirmedBy: OWNER_ADMIN_EMAIL,
      kind: 'broadcast',
      sentAt: new Date().toISOString(),
    };
    store.emailDispatches = [dispatch, ...(store.emailDispatches || [])];
    store.notifications.forEach((n) => {
      n.emailDigestSent = true;
    });
    store.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: `Admin Email Sent: ${dispatch.subject}`,
      body: `Confirmed by Admin and dispatched to ${recipientEmails.length} registered emails.`,
      category: 'system',
      emailDigestSent: true,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    broadcast('notification:new', store.notifications[0]);
    res.json({ dispatch, recipientCount: recipientEmails.length });
  });

  app.post('/api/errors', (req, res) => {
    const { reporterUsername, reporterName, target, subject, category, title, description } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Title and description required.' });
    const report: ErrorReport = {
      id: `err-${Date.now()}`,
      reporterUsername,
      reporterName,
      target: target || 'admin',
      subject: subject || 'System',
      category: category || 'Technical Bug',
      title,
      description,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    store.errorReports.unshift(report);
    store.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: `Error Report Filed (${report.category})`,
      body: `${reporterName} reported "${title}" to ${report.target}.`,
      category: 'system',
      emailDigestSent: false,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    broadcast('notification:new', store.notifications[0]);
    res.json({ report });
  });

  app.post('/api/errors/:id/resolve', (req, res) => {
    const { resolutionNote, resolvedBy, role } = req.body;
    if (role === 'admin' && !verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Verified owner Admin session required.' });
    }
    if (role !== 'teacher' && role !== 'admin') {
      return res.status(403).json({ error: 'Only teachers or admins can mark error reports resolved.' });
    }
    const report = store.errorReports.find((r) => r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Error report not found.' });
    report.status = 'resolved';
    report.resolutionNote = String(resolutionNote || 'Issue verified and fixed.');
    report.resolvedBy = resolvedBy || 'Staff';
    report.resolvedAt = new Date().toISOString();
    store.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: `Error Report Resolved: ${report.title}`,
      body: `Resolved by ${report.resolvedBy}: ${report.resolutionNote}`,
      category: 'system',
      emailDigestSent: false,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    broadcast('notification:new', store.notifications[0]);
    res.json({ report });
  });

  app.post('/api/admin/config', (req, res) => {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Admin access denied: Only the verified platform owner can modify global settings.' });
    }
    const { appName, whatsappChannelUrl, supportTeacherPhone, featuredBannerTitle, featuredBannerSubtitle } = req.body;
    if (appName) store.config.appName = String(appName).trim();
    if (whatsappChannelUrl) store.config.whatsappChannelUrl = whatsappChannelUrl;
    if (supportTeacherPhone) store.config.supportTeacherPhone = supportTeacherPhone;
    if (featuredBannerTitle) store.config.featuredBannerTitle = featuredBannerTitle;
    if (featuredBannerSubtitle) store.config.featuredBannerSubtitle = featuredBannerSubtitle;
    saveStore(store);
    res.json({ config: getSanitizedConfig(true) });
  });

  app.post('/api/admin/passkey', (req, res) => {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Admin access denied: Only the verified platform owner can set the Admin Passkey.' });
    }
    const { passkey } = req.body;
    const rawCfg = store.config as any;
    if (!passkey || !String(passkey).trim()) {
      delete rawCfg.adminPasskeyHash;
    } else {
      rawCfg.adminPasskeyHash = hashPasskey(String(passkey).trim());
    }
    saveStore(store);
    res.json({ config: getSanitizedConfig(true) });
  });

  app.post('/api/admin/ads', (req, res) => {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Admin access denied: Only the verified platform owner can upload ads.' });
    }
    const { title, subtitle, mediaType, imageUrl, videoUrl, ctaLabel, ctaSection, externalUrl, placement } =
      req.body || {};
    const resolvedType: 'image' | 'video' = mediaType === 'video' || (videoUrl && !imageUrl) ? 'video' : 'image';
    if (!String(title || '').trim()) {
      return res.status(400).json({ error: 'Ad title is required.' });
    }
    if (resolvedType === 'image' && !String(imageUrl || '').trim()) {
      return res.status(400).json({ error: 'Image ad requires an uploaded image or image URL.' });
    }
    if (resolvedType === 'video' && !String(videoUrl || '').trim()) {
      return res.status(400).json({ error: 'Video ad requires an uploaded video file or video URL.' });
    }
    const ad: ImageAdItem = {
      id: `ad-${Date.now()}`,
      title: String(title).trim(),
      subtitle: String(subtitle || '').trim() || `Featured announcement on ${store.config.appName}.`,
      mediaType: resolvedType,
      imageUrl: imageUrl ? String(imageUrl).trim() : undefined,
      videoUrl: videoUrl ? String(videoUrl).trim() : undefined,
      ctaLabel: ctaLabel ? String(ctaLabel).trim() : undefined,
      ctaSection:
        ctaSection === 'library' ||
        ctaSection === 'exams' ||
        ctaSection === 'lab' ||
        ctaSection === 'ai' ||
        ctaSection === 'workspace'
          ? ctaSection
          : undefined,
      externalUrl: externalUrl ? String(externalUrl).trim() : undefined,
      placement: placement === 'workspace' || placement === 'library' ? placement : 'all',
      active: true,
      createdAt: new Date().toISOString(),
    };
    store.config.imageAds = [ad, ...(store.config.imageAds || [])];
    saveStore(store);
    res.json({ ad, imageAds: store.config.imageAds });
  });

  app.patch('/api/admin/ads/:id', (req, res) => {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Admin access denied.' });
    }
    const ad = (store.config.imageAds || []).find((a) => a.id === req.params.id);
    if (!ad) return res.status(404).json({ error: 'Image ad not found.' });
    ad.active = typeof req.body?.active === 'boolean' ? req.body.active : !ad.active;
    saveStore(store);
    res.json({ ad, imageAds: store.config.imageAds });
  });

  app.delete('/api/admin/ads/:id', (req, res) => {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({ error: 'Admin access denied.' });
    }
    store.config.imageAds = (store.config.imageAds || []).filter((a) => a.id !== req.params.id);
    saveStore(store);
    res.json({ imageAds: store.config.imageAds });
  });

  // --- Server-Side Gemini AI Endpoints ---
  app.post('/api/ai/tutor', async (req, res) => {
    try {
      const { studentUsername, customQuestion } = req.body;
      const isOwnerAdmin = verifyAdminToken(req);
      const viewer = resolveViewerUser(req, isOwnerAdmin);
      if (!viewer) {
        return res.status(401).json({ error: 'Please sign in or register an account first.' });
      }
      if (viewer.username !== studentUsername) {
        const allowed =
          viewer.role === 'teacher' && getTeacherStudentUsernames(store, viewer).has(String(studentUsername || ''));
        if (!allowed) {
          return res.status(403).json({
            error: 'Access Denied: You may only run mistake analysis for your own results.',
          });
        }
      }
      const user = store.users.find((u) => u.username === studentUsername);
      const userAttempts = store.attempts.filter((a) => a.studentUsername === studentUsername);

      const weakTopics: string[] = [];
      for (const att of userAttempts) {
        for (const qr of att.questionResults) {
          if (!qr.isCorrect) weakTopics.push(`${att.subject}: ${qr.topic}`);
        }
      }

      const prompt = `You are an expert Tanzanian ACSEE Physics & Mathematics AI Teacher on ${store.config.appName}.
Student: ${user?.realName || studentUsername} (${user?.className || 'Form VI'}, ${user?.schoolName || ''}).
Exam History Summary: ${JSON.stringify(
        userAttempts.map((a) => ({
          exam: a.examTitle,
          subject: a.subject,
          score: `${a.score}/${a.totalMarks}`,
          grade: a.acseeGrade,
          missedTopics: a.questionResults.filter((r) => !r.isCorrect).map((r) => r.topic),
        }))
      )}.
Detected Weak Topics: ${weakTopics.length > 0 ? weakTopics.join(', ') : 'None yet — give advanced ACSEE challenge drills.'}
${customQuestion ? `Student asks: "${customQuestion}"` : ''}

Provide a structured diagnostic and remediation plan specifically for ACSEE Physics and Mathematics.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              diagnosisSummary: { type: Type.STRING },
              weakAreas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    topic: { type: Type.STRING },
                    mistakePattern: { type: Type.STRING },
                    whatToDo: { type: Type.STRING },
                    practiceExercise: { type: Type.STRING },
                    solutionGuide: { type: Type.STRING },
                  },
                },
              },
              nextStudyPlan: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'AI Tutor request failed.' });
    }
  });

  app.post('/api/ai/scan-grade', async (req, res) => {
    try {
      const { examId, studentUsername, imageBase64, mimeType, handwrittenNotes } = req.body;
      const exam = store.exams.find((e) => e.id === examId);
      const user = store.users.find((u) => u.username === studentUsername);
      if (!exam || !user) return res.status(404).json({ error: 'Exam or student not found.' });

      const rubric = exam.questions.map((q, idx) => ({
        index: idx + 1,
        id: q.id,
        topic: q.topic,
        prompt: q.prompt,
        options: q.options,
        correctOptionLetter: String.fromCharCode(65 + q.correctIndex),
        marks: q.marks,
      }));

      const parts: any[] = [];
      if (imageBase64) {
        parts.push({
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: String(imageBase64).replace(/^data:[^;]+;base64,/, ''),
          },
        });
      }
      parts.push({
        text: `You are grading a physical scanned Physics/Mathematics exam paper for ${user.realName}.
Exam: ${exam.title}
Questions & Official Marking Key: ${JSON.stringify(rubric)}
${handwrittenNotes ? `Typed/OCR Transcript from candidate sheet: ${handwrittenNotes}` : ''}

Inspect the scanned answer sheet (and/or transcript). Determine which option index (0=A, 1=B, 2=C, 3=D, or -1 if blank/unanswered) the student chose or derived for each question. Award full marks immediately when the answer matches the marking key.`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scanSummary: { type: Type.STRING },
              detectedAnswers: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    questionId: { type: Type.STRING },
                    selectedIndex: { type: Type.INTEGER },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const detectedMap = new Map<string, number>();
      for (const item of parsed.detectedAnswers || []) {
        detectedMap.set(item.questionId, item.selectedIndex);
      }

      let score = 0;
      let totalMarks = 0;
      const questionResults: QuestionResult[] = exam.questions.map((q) => {
        totalMarks += q.marks;
        const selectedIndex = detectedMap.has(q.id) ? detectedMap.get(q.id)! : -1;
        const isCorrect = selectedIndex === q.correctIndex;
        const marksAwarded = isCorrect ? q.marks : 0;
        score += marksAwarded;
        return {
          questionId: q.id,
          topic: q.topic,
          selectedIndex,
          correctIndex: q.correctIndex,
          isCorrect,
          marksAwarded,
          maxMarks: q.marks,
        };
      });

      const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
      const acsee = calculateAcseeGrade(percentage);

      const attempt: ExamAttempt = {
        id: `att-scan-${Date.now()}`,
        examId: exam.id,
        examTitle: exam.title,
        subject: exam.subject,
        studentUsername: user.username,
        studentName: user.realName,
        schoolName: user.schoolName,
        className: user.className,
        classCode: user.classCode,
        mode: 'physical_scan',
        startedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        elapsedSeconds: 3600,
        score,
        totalMarks,
        percentage,
        acseeGrade: acsee.grade,
        acseePoints: acsee.points,
        status: 'pending_review', // Queued for teacher review before release
        scanSummary: parsed.scanSummary || 'Physical answer sheet scanned and instantly marked.',
        questionResults,
      };

      store.attempts.unshift(attempt);
      saveStore(store);
      res.json({ attempt, scanSummary: attempt.scanSummary });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Physical scan marking failed.' });
    }
  });

  app.post('/api/ai/hub', async (req, res) => {
    try {
      const { subject, query } = req.body;
      if (!query) return res.status(400).json({ error: 'Query is required.' });
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `You are the ${store.config.appName} ACSEE ${subject || 'Physics & Mathematics'} Research & Solving Assistant.
Solve or explain rigorously with clear equations, SI units, and ACSEE exam tips.
Query: ${query}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        },
      });
      res.json({ answer: response.text || 'No response generated.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'AI Hub error.' });
    }
  });

  app.post('/api/ai/fix-error', async (req, res) => {
    try {
      const { reportId } = req.body;
      const report = store.errorReports.find((r) => r.id === reportId);
      if (!report) return res.status(404).json({ error: 'Error report not found.' });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `You are the Errors Fixing AI Agent for ${store.config.appName} (an ACSEE Physics & Mathematics platform).
Diagnose this reported issue and provide a clear, verified resolution for the teacher/admin and student:
Subject: ${report.subject}
Target: ${report.target}
Title: ${report.title}
Description: ${report.description}`,
      });

      report.aiFixSuggestion = response.text || 'Reviewed by AI Agent.';
      report.status = 'ai_diagnosed';
      saveStore(store);
      res.json({ report });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errors Fixing AI Agent failed.' });
    }
  });

  // --- Vite Middleware / Static Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`${store.config.appName} server listening on http://localhost:${PORT}`);
  });
}

startServer();
