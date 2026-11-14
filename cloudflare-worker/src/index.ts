import {
  generateSalt,
  hashPassword,
  signJwt,
  verifyJwt,
  verifyPassword,
} from './auth';
import {
  getUserCloudData,
  saveUserCloudData,
  softDeleteLesson,
  upsertSingleLesson,
  type CloudLessonItem,
  type CloudSyncBody,
} from './sync';

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const secret = env.JWT_SECRET || 'darsnegar-dev-secret';

    const getAuthUser = async () => {
      const auth = request.headers.get('Authorization');
      if (!auth || !auth.startsWith('Bearer ')) return null;
      const token = auth.slice(7).trim();
      if (!token) return null;
      return verifyJwt(token, secret);
    };

    try {
      if (method === 'GET' && url.pathname === '/api/health') {
        return jsonResponse({ ok: true, provider: 'cloudflare-worker' });
      }

      if (method === 'POST' && url.pathname === '/api/auth/register') {
        const body = (await request.json()) as {
          email?: string;
          password?: string;
          name?: string;
          website?: string;
        };
        if (body.website && body.website.trim().length > 0) {
          return errorResponse('درخواست نامعتبر است.', 400);
        }
        const email = body.email?.trim().toLowerCase();
        const password = body.password?.trim();
        const name = body.name?.trim() || email?.split('@')[0] || 'کاربر';

        if (!email || !email.includes('@')) {
          return errorResponse('لطفاً یک ایمیل معتبر وارد کنید.');
        }
        if (!password || password.length < 6) {
          return errorResponse('رمز عبور باید حداقل ۶ کاراکتر باشد.');
        }

        const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
          .bind(email)
          .first();
        if (existing) {
          return errorResponse('این ایمیل قبلاً ثبت‌نام کرده است.', 409);
        }

        const userId = crypto.randomUUID();
        const salt = generateSalt();
        const passwordHash = await hashPassword(password, salt);
        const now = Date.now();

        await env.DB.prepare(
          'INSERT INTO users (id, email, password_hash, salt, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(userId, email, passwordHash, salt, name, now, now)
          .run();

        const token = await signJwt({ userId, email, name }, secret);
        return jsonResponse({ user: { id: userId, email, name }, token }, 201);
      }

      if (method === 'POST' && url.pathname === '/api/auth/login') {
        const body = (await request.json()) as { email?: string; password?: string };
        const email = body.email?.trim().toLowerCase();
        const password = body.password?.trim();

        if (!email || !password) {
          return errorResponse('ایمیل و رمز عبور الزامی است.');
        }

        const user = await env.DB.prepare(
          'SELECT id, email, password_hash, salt, name FROM users WHERE email = ?'
        )
          .bind(email)
          .first<{
            id: string;
            email: string;
            password_hash: string;
            salt: string;
            name: string;
          }>();

        if (!user) {
          return errorResponse('ایمیل یا رمز عبور اشتباه است.', 401);
        }

        const valid = await verifyPassword(password, user.salt, user.password_hash);
        if (!valid) {
          return errorResponse('ایمیل یا رمز عبور اشتباه است.', 401);
        }

        const token = await signJwt(
          { userId: user.id, email: user.email, name: user.name },
          secret
        );
        return jsonResponse({
          user: { id: user.id, email: user.email, name: user.name },
          token,
        });
      }

      if (method === 'GET' && url.pathname === '/api/auth/me') {
        const authUser = await getAuthUser();
        if (!authUser) return errorResponse('نیاز به ورود به حساب کاربری است.', 401);
        const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?')
          .bind(authUser.userId)
          .first();
        if (!user) return errorResponse('کاربر یافت نشد.', 404);
        return jsonResponse({ user });
      }

      if (method === 'GET' && url.pathname === '/api/sync') {
        const authUser = await getAuthUser();
        if (!authUser) return errorResponse('نیاز به ورود به حساب کاربری است.', 401);
        const data = await getUserCloudData(env.DB, authUser.userId);
        return jsonResponse(data);
      }

      if (method === 'POST' && url.pathname === '/api/sync') {
        const authUser = await getAuthUser();
        if (!authUser) return errorResponse('نیاز به ورود به حساب کاربری است.', 401);
        const body = (await request.json()) as CloudSyncBody;
        const result = await saveUserCloudData(env.DB, authUser.userId, body);
        return jsonResponse(result);
      }

      if (method === 'GET' && url.pathname === '/api/lessons') {
        const authUser = await getAuthUser();
        if (!authUser) return errorResponse('نیاز به ورود به حساب کاربری است.', 401);
        const data = await getUserCloudData(env.DB, authUser.userId);
        return jsonResponse({ lessons: data.lessons });
      }

      if (method === 'POST' && url.pathname === '/api/lessons') {
        const authUser = await getAuthUser();
        if (!authUser) return errorResponse('نیاز به ورود به حساب کاربری است.', 401);
        const body = (await request.json()) as CloudLessonItem;
        if (!body || typeof body.id !== 'string' || typeof body.title !== 'string') {
          return errorResponse('ساختار درس معتبر نیست.');
        }
        const saved = await upsertSingleLesson(env.DB, authUser.userId, body);
        return jsonResponse({ success: true, lesson: saved }, 201);
      }

      if (method === 'DELETE' && url.pathname.startsWith('/api/lessons/')) {
        const authUser = await getAuthUser();
        if (!authUser) return errorResponse('نیاز به ورود به حساب کاربری است.', 401);
        const lessonId = decodeURIComponent(url.pathname.slice('/api/lessons/'.length));
        if (!lessonId) return errorResponse('شناسه درس مشخص نیست.');
        const res = await softDeleteLesson(env.DB, authUser.userId, lessonId);
        return jsonResponse(res);
      }

      return errorResponse('مسیر یافت نشد.', 404);
    } catch (err) {
      console.error('Worker API Error:', err);
      return errorResponse('خطای داخلی سرور کلادفلر رخ داد.', 500);
    }
  },
};
