import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type Request, type Response } from 'express';

interface StoredUser {
  id: string;
  email: string;
  name: string;
  salt: string;
  passwordHash: string;
  createdAt: number;
}

interface StoredLesson {
  id: string;
  title: string;
  updatedAt: number;
  [key: string]: unknown;
}

interface DeletedRecord {
  id: string;
  deletedAt: number;
}

interface UserCloudBucket {
  lessons: Record<string, StoredLesson>;
  deletedLessons: Record<string, number>;
  progress: Record<string, { state: string; updatedAt: number }>;
  gamification: {
    streak: number;
    xp: number;
    lastActiveDate: string;
    examsCompleted: number;
  };
  examHistory: Array<{ id: string; completedAt: number; [key: string]: unknown }>;
}

interface CloudDatabaseFile {
  users: Record<string, StoredUser>;
  buckets: Record<string, UserCloudBucket>;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'cloud-store.json');
const JWT_SECRET = process.env.JWT_SECRET || 'darsnegar-local-cloud-secret-dev';

function ensureDb(): CloudDatabaseFile {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const initial: CloudDatabaseFile = { users: {}, buckets: {} };
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CloudDatabaseFile>;
    return {
      users: parsed.users ?? {},
      buckets: parsed.buckets ?? {},
    };
  } catch {
    return { users: {}, buckets: {} };
  }
}

function saveDb(db: CloudDatabaseFile): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

function getOrCreateBucket(db: CloudDatabaseFile, userId: string): UserCloudBucket {
  if (!db.buckets[userId]) {
    db.buckets[userId] = {
      lessons: {},
      deletedLessons: {},
      progress: {},
      gamification: { streak: 1, xp: 0, lastActiveDate: '', examsCompleted: 0 },
      examHistory: [],
    };
  }
  return db.buckets[userId];
}

function toBase64Url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function hashPassword(password: string, salt: string): string {
  return toBase64Url(crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha256'));
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const candidate = Buffer.from(hashPassword(password, salt));
  const expected = Buffer.from(expectedHash);
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

interface JwtClaims {
  userId: string;
  email: string;
  name: string;
  exp: number;
}

function signJwt(payload: Omit<JwtClaims, 'exp'>): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims: JwtClaims = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };
  const body = toBase64Url(JSON.stringify(claims));
  const unsigned = `${header}.${body}`;
  const sig = toBase64Url(crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest());
  return `${unsigned}.${sig}`;
}

function verifyJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const unsigned = `${header}.${body}`;
    const expectedSig = toBase64Url(
      crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest()
    );
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const claims = JSON.parse(fromBase64Url(body).toString('utf-8')) as JwtClaims;
    if (!claims.userId || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

function extractAuthUser(req: Request): JwtClaims | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token ? verifyJwt(token) : null;
}

function serializeBucketForClient(bucket: UserCloudBucket) {
  const deletedLessons: DeletedRecord[] = [];
  const lessons: StoredLesson[] = [];

  for (const [id, deletedAt] of Object.entries(bucket.deletedLessons)) {
    const existing = bucket.lessons[id];
    if (!existing || deletedAt >= (existing.updatedAt || 0)) {
      deletedLessons.push({ id, deletedAt });
    }
  }

  for (const lesson of Object.values(bucket.lessons)) {
    const delAt = bucket.deletedLessons[lesson.id];
    if (delAt && delAt >= (lesson.updatedAt || 0)) continue;
    lessons.push(lesson);
  }

  return {
    lessons,
    deletedLessons,
    progress: bucket.progress,
    gamification: bucket.gamification,
    examHistory: bucket.examHistory,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // CORS for direct browser requests from any frontend origin
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, provider: 'darsnegar-cloud-compatible' });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      email?: string;
      password?: string;
      name?: string;
      website?: string;
    };
    if (body.website && body.website.trim().length > 0) {
      res.status(400).json({ error: 'درخواست نامعتبر است.' });
      return;
    }
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const name = body.name?.trim() || email?.split('@')[0] || 'کاربر';

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'لطفاً یک ایمیل معتبر وارد کنید.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
      return;
    }

    const db = ensureDb();
    const exists = Object.values(db.users).some((u) => u.email === email);
    if (exists) {
      res.status(409).json({ error: 'این ایمیل قبلاً ثبت‌نام کرده است.' });
      return;
    }

    const userId = crypto.randomUUID();
    const salt = toBase64Url(crypto.randomBytes(16));
    const passwordHash = hashPassword(password, salt);

    db.users[userId] = {
      id: userId,
      email,
      name,
      salt,
      passwordHash,
      createdAt: Date.now(),
    };
    getOrCreateBucket(db, userId);
    saveDb(db);

    const token = signJwt({ userId, email, name });
    res.status(201).json({ user: { id: userId, email, name }, token });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();

    if (!email || !password) {
      res.status(400).json({ error: 'ایمیل و رمز عبور الزامی است.' });
      return;
    }

    const db = ensureDb();
    const user = Object.values(db.users).find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      res.status(401).json({ error: 'ایمیل یا رمز عبور اشتباه است.' });
      return;
    }

    const token = signJwt({ userId: user.id, email: user.email, name: user.name });
    res.json({ user: { id: user.id, email: user.email, name: user.name }, token });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const claims = extractAuthUser(req);
    if (!claims) {
      res.status(401).json({ error: 'نیاز به ورود به حساب کاربری است.' });
      return;
    }
    const db = ensureDb();
    const user = db.users[claims.userId];
    if (!user) {
      res.status(404).json({ error: 'کاربر یافت نشد.' });
      return;
    }
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  app.get('/api/sync', (req: Request, res: Response) => {
    const claims = extractAuthUser(req);
    if (!claims) {
      res.status(401).json({ error: 'نیاز به ورود به حساب کاربری است.' });
      return;
    }
    const db = ensureDb();
    const bucket = getOrCreateBucket(db, claims.userId);
    res.json(serializeBucketForClient(bucket));
  });

  app.post('/api/sync', (req: Request, res: Response) => {
    const claims = extractAuthUser(req);
    if (!claims) {
      res.status(401).json({ error: 'نیاز به ورود به حساب کاربری است.' });
      return;
    }
    const body = (req.body ?? {}) as {
      lessons?: StoredLesson[];
      deletedLessons?: DeletedRecord[];
      progress?: Record<string, { state: string; updatedAt: number }>;
      gamification?: UserCloudBucket['gamification'];
      examHistory?: UserCloudBucket['examHistory'];
    };

    const db = ensureDb();
    const bucket = getOrCreateBucket(db, claims.userId);
    let syncedLessons = 0;

    if (Array.isArray(body.deletedLessons)) {
      for (const rec of body.deletedLessons) {
        if (!rec || typeof rec.id !== 'string') continue;
        const delAt = typeof rec.deletedAt === 'number' ? rec.deletedAt : Date.now();
        const prev = bucket.deletedLessons[rec.id] ?? 0;
        if (delAt > prev) {
          bucket.deletedLessons[rec.id] = delAt;
        }
        const existingLesson = bucket.lessons[rec.id];
        if (existingLesson && delAt >= (existingLesson.updatedAt || 0)) {
          delete bucket.lessons[rec.id];
        }
      }
    }

    if (Array.isArray(body.lessons)) {
      for (const lesson of body.lessons) {
        if (!lesson || typeof lesson.id !== 'string') continue;
        const updatedAt = typeof lesson.updatedAt === 'number' ? lesson.updatedAt : Date.now();
        const delAt = bucket.deletedLessons[lesson.id];
        if (delAt && delAt >= updatedAt) continue;

        const prev = bucket.lessons[lesson.id];
        if (!prev || updatedAt >= (prev.updatedAt || 0)) {
          bucket.lessons[lesson.id] = { ...lesson, updatedAt };
          delete bucket.deletedLessons[lesson.id];
          syncedLessons += 1;
        }
      }
    }

    if (body.progress && typeof body.progress === 'object') {
      for (const [qId, entry] of Object.entries(body.progress)) {
        if (!entry || typeof entry.state !== 'string') continue;
        const prev = bucket.progress[qId];
        if (!prev || (entry.updatedAt || 0) >= (prev.updatedAt || 0)) {
          bucket.progress[qId] = {
            state: entry.state,
            updatedAt: entry.updatedAt || Date.now(),
          };
        }
      }
    }

    if (body.gamification) {
      const g = body.gamification;
      bucket.gamification = {
        xp: Math.max(bucket.gamification.xp || 0, g.xp || 0),
        streak: Math.max(bucket.gamification.streak || 1, g.streak || 1),
        examsCompleted: Math.max(
          bucket.gamification.examsCompleted || 0,
          g.examsCompleted || 0
        ),
        lastActiveDate:
          (g.lastActiveDate || '') >= (bucket.gamification.lastActiveDate || '')
            ? g.lastActiveDate || ''
            : bucket.gamification.lastActiveDate,
      };
    }

    if (Array.isArray(body.examHistory)) {
      const byId = new Map<string, UserCloudBucket['examHistory'][number]>();
      for (const ex of [...bucket.examHistory, ...body.examHistory]) {
        if (ex && typeof ex.id === 'string' && !byId.has(ex.id)) {
          byId.set(ex.id, ex);
        }
      }
      bucket.examHistory = Array.from(byId.values())
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
        .slice(0, 30);
    }

    saveDb(db);
    res.json({ success: true, syncedLessons });
  });

  app.get('/api/lessons', (req: Request, res: Response) => {
    const claims = extractAuthUser(req);
    if (!claims) {
      res.status(401).json({ error: 'نیاز به ورود به حساب کاربری است.' });
      return;
    }
    const db = ensureDb();
    const bucket = getOrCreateBucket(db, claims.userId);
    res.json({ lessons: serializeBucketForClient(bucket).lessons });
  });

  app.post('/api/lessons', (req: Request, res: Response) => {
    const claims = extractAuthUser(req);
    if (!claims) {
      res.status(401).json({ error: 'نیاز به ورود به حساب کاربری است.' });
      return;
    }
    const lesson = req.body as StoredLesson;
    if (!lesson || typeof lesson.id !== 'string' || typeof lesson.title !== 'string') {
      res.status(400).json({ error: 'ساختار درس معتبر نیست.' });
      return;
    }
    const db = ensureDb();
    const bucket = getOrCreateBucket(db, claims.userId);
    const updatedAt = typeof lesson.updatedAt === 'number' ? lesson.updatedAt : Date.now();
    const saved = { ...lesson, updatedAt };
    bucket.lessons[lesson.id] = saved;
    delete bucket.deletedLessons[lesson.id];
    saveDb(db);
    res.status(201).json({ success: true, lesson: saved });
  });

  app.delete('/api/lessons/:id', (req: Request, res: Response) => {
    const claims = extractAuthUser(req);
    if (!claims) {
      res.status(401).json({ error: 'نیاز به ورود به حساب کاربری است.' });
      return;
    }
    const rawId = req.params.id;
    const lessonId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!lessonId) {
      res.status(400).json({ error: 'شناسه درس نامعتبر است.' });
      return;
    }
    const db = ensureDb();
    const bucket = getOrCreateBucket(db, claims.userId);
    const deletedAt = Date.now();
    bucket.deletedLessons[lessonId] = deletedAt;
    delete bucket.lessons[lessonId];
    saveDb(db);
    res.json({ success: true, deletedAt });
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Darsnegar server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
