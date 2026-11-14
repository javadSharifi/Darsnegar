import type {
  CloudSyncPayload,
  CloudUser,
  DeletedLessonRecord,
  Lesson,
} from '../types/learning';

import {
  EMPTY_OFFLINE_QUEUE,
  normalizeOfflineQueue,
  type OfflineSyncQueue,
} from '../utils/offlineQueue';

export const CF_AUTH_TOKEN_KEY = 'darsnegar_cf_token_v1';
export const CF_AUTH_USER_KEY = 'darsnegar_cf_user_v1';
export const CF_API_URL_KEY = 'darsnegar_cf_api_url_v1';
export const CF_LAST_SYNCED_KEY = 'darsnegar_cf_last_synced_v1';
export const CF_DELETED_LESSONS_KEY = 'darsnegar_cf_deleted_lessons_v1';
export const CF_PENDING_SYNC_KEY = 'darsnegar_cf_pending_sync_v1';

export const DEFAULT_PROD_API_URL =
  'https://darsnegar-api.mohammadjavadsharifi98.workers.dev';

export function getEnvDefaultApiBaseUrl(): string {
  const envUrl =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_CLOUDFLARE_API_URL === 'string'
      ? import.meta.env.VITE_CLOUDFLARE_API_URL
      : '';
  return envUrl.trim().replace(/\/+$/, '') || DEFAULT_PROD_API_URL;
}

export function getStoredApiBaseUrl(): string {
  try {
    const saved = window.localStorage.getItem(CF_API_URL_KEY);
    if (saved && saved.trim().length > 0) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch {
    // Ignore storage read error
  }
  return getEnvDefaultApiBaseUrl();
}

export function setStoredApiBaseUrl(url: string): string {
  const clean = url.trim().replace(/\/+$/, '');
  try {
    if (!clean) {
      window.localStorage.removeItem(CF_API_URL_KEY);
    } else {
      window.localStorage.setItem(CF_API_URL_KEY, clean);
    }
  } catch {
    // Ignore storage write error
  }
  return clean || getEnvDefaultApiBaseUrl();
}

export function getStoredCloudToken(): string | null {
  try {
    return window.localStorage.getItem(CF_AUTH_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getStoredCloudUser(): CloudUser | null {
  try {
    const raw = window.localStorage.getItem(CF_AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as CloudUser) : null;
  } catch {
    return null;
  }
}

export function getStoredLastSyncedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(CF_LAST_SYNCED_KEY);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

export function saveCloudSession(user: CloudUser, token: string): void {
  try {
    window.localStorage.setItem(CF_AUTH_USER_KEY, JSON.stringify(user));
    window.localStorage.setItem(CF_AUTH_TOKEN_KEY, token);
  } catch {
    // Ignore
  }
}

export function clearCloudSession(): void {
  try {
    window.localStorage.removeItem(CF_AUTH_USER_KEY);
    window.localStorage.removeItem(CF_AUTH_TOKEN_KEY);
    window.localStorage.removeItem(CF_LAST_SYNCED_KEY);
    window.localStorage.removeItem(CF_PENDING_SYNC_KEY);
  } catch {
    // Ignore
  }
}

export function getStoredOfflineQueue(): OfflineSyncQueue {
  try {
    const raw = window.localStorage.getItem(CF_PENDING_SYNC_KEY);
    if (!raw) return { ...EMPTY_OFFLINE_QUEUE };
    return normalizeOfflineQueue(JSON.parse(raw));
  } catch {
    return { ...EMPTY_OFFLINE_QUEUE };
  }
}

export function saveOfflineQueue(queue: OfflineSyncQueue): void {
  try {
    if (!queue.dirty && queue.pendingChangesCount === 0) {
      window.localStorage.removeItem(CF_PENDING_SYNC_KEY);
      return;
    }
    window.localStorage.setItem(CF_PENDING_SYNC_KEY, JSON.stringify(queue));
  } catch {
    // Ignore quota errors cleanly
  }
}

export function clearOfflineQueue(): void {
  try {
    window.localStorage.removeItem(CF_PENDING_SYNC_KEY);
  } catch {
    // Ignore
  }
}

export function saveLastSyncedAt(timestamp: number): void {
  try {
    window.localStorage.setItem(CF_LAST_SYNCED_KEY, String(timestamp));
  } catch {
    // Ignore
  }
}

export function getDeletedLessonRecords(): DeletedLessonRecord[] {
  try {
    const raw = window.localStorage.getItem(CF_DELETED_LESSONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DeletedLessonRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveDeletedLessonRecords(records: DeletedLessonRecord[]): void {
  try {
    window.localStorage.setItem(CF_DELETED_LESSONS_KEY, JSON.stringify(records));
  } catch {
    // Ignore
  }
}

export function recordDeletedLesson(lessonId: string): DeletedLessonRecord[] {
  const existing = getDeletedLessonRecords().filter((r) => r.id !== lessonId);
  const next = [...existing, { id: lessonId, deletedAt: Date.now() }];
  saveDeletedLessonRecords(next);
  return next;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  baseUrlOverride?: string;
  timeoutMs?: number;
}

async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl =
    options.baseUrlOverride && options.baseUrlOverride.trim()
      ? options.baseUrlOverride.trim().replace(/\/+$/, '')
      : getStoredApiBaseUrl();

  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = baseUrl ? `${baseUrl}${normalizedEndpoint}` : normalizedEndpoint;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  try {
    // No keepalive: Chrome rejects keepalive POSTs with bodies over 64KB ("Failed to fetch"),
    // and sync payloads exceed that easily.
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new Error(`خطای پاسخ سرور (${res.status})`);
    }

    if (!res.ok) {
      const errObj = data as { error?: string };
      throw new Error(errObj?.error || `خطای سرور (${res.status})`);
    }

    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('اتصال به سرور بیش از حد طول کشید (Timeout).');
    }
    if (err instanceof TypeError) {
      throw new Error('ارتباط با سرور کلادفلر برقرار نشد. آدرس ورکر یا اینترنت خود را بررسی کنید.');
    }
    throw err instanceof Error ? err : new Error('خطای ناشناخته در ارتباط با سرور کلادفلر.');
  } finally {
    window.clearTimeout(timer);
  }
}

export async function healthCheckApi(
  baseUrlOverride?: string
): Promise<{ ok: boolean; provider?: string }> {
  return apiRequest<{ ok: boolean; provider?: string }>('/api/health', {
    method: 'GET',
    baseUrlOverride,
    timeoutMs: 8_000,
  });
}

export async function registerApi(
  email: string,
  password: string,
  name?: string,
  extra?: { website?: string }
): Promise<{ user: CloudUser; token: string }> {
  return apiRequest<{ user: CloudUser; token: string }>('/api/auth/register', {
    method: 'POST',
    body: { email, password, name, ...extra },
  });
}

export async function loginApi(
  email: string,
  password: string
): Promise<{ user: CloudUser; token: string }> {
  return apiRequest<{ user: CloudUser; token: string }>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function getMeApi(token: string): Promise<CloudUser> {
  const res = await apiRequest<{ user: CloudUser }>('/api/auth/me', {
    method: 'GET',
    token,
  });
  return res.user;
}

export async function pullCloudSyncApi(token: string): Promise<Partial<CloudSyncPayload>> {
  return apiRequest<Partial<CloudSyncPayload>>('/api/sync', {
    method: 'GET',
    token,
  });
}

export async function pushCloudSyncApi(
  token: string,
  payload: CloudSyncPayload
): Promise<{ success: boolean; syncedLessons: number }> {
  return apiRequest<{ success: boolean; syncedLessons: number }>('/api/sync', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function pushSingleLessonApi(
  token: string,
  lesson: Lesson
): Promise<{ success: boolean; lesson: Lesson }> {
  return apiRequest<{ success: boolean; lesson: Lesson }>('/api/lessons', {
    method: 'POST',
    token,
    body: lesson,
  });
}

export async function deleteCloudLessonApi(
  token: string,
  lessonId: string
): Promise<{ success: boolean; deletedAt: number }> {
  return apiRequest<{ success: boolean; deletedAt: number }>(
    `/api/lessons/${encodeURIComponent(lessonId)}`,
    {
      method: 'DELETE',
      token,
    }
  );
}
