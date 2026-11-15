import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppSettings,
  ClassNote,
  CloudSyncResult,
  CloudUser,
  ExamAttempt,
  GamificationStats,
  HighlightColor,
  Lesson,
  LessonQuestion,
  QuestionProgressState,
  TextHighlight,
  UserQuestionProgress,
} from '../types/learning';
import {
  clearCloudSession,
  clearOfflineQueue,
  deleteCloudLessonApi,
  getDeletedLessonRecords,
  getStoredApiBaseUrl,
  getStoredCloudToken,
  getStoredCloudUser,
  getStoredLastSyncedAt,
  getStoredOfflineQueue,
  healthCheckApi,
  loginApi,
  pullCloudSyncApi,
  pushCloudSyncApi,
  pushSingleLessonApi,
  recordDeletedLesson,
  registerApi,
  saveCloudSession,
  saveDeletedLessonRecords,
  saveLastSyncedAt,
  saveOfflineQueue,
  setStoredApiBaseUrl,
} from '../services/cloudflareApi';
import type { ReconnectSyncStatus } from '../components/OfflineStatusBanner';
import { mergeFullCloudPayload } from '../utils/cloudMerge';
import {
  EMPTY_OFFLINE_QUEUE,
  enqueueOfflineChange,
  shouldFlushOfflineQueue,
  type OfflineSyncQueue,
} from '../utils/offlineQueue';
import {
  createBackupPayload,
  getLocalDateKey,
  toPersianDigits,
  updateGamificationOnActivity,
  validateBackupPayload,
} from '../utils/studyEngine';

const KEYS = {
  lessons: 'darsnegar_lessons_v2',
  legacyLessonsV1: 'darsnegar_lessons_v1',
  progress: 'darsnegar_progress_v1',
  gamification: 'darsnegar_gamification_v1',
  examHistory: 'darsnegar_exams_v1',
  settings: 'darsnegar_settings_v1',
  activeLessonId: 'darsnegar_active_lesson_v2',
} as const;

const LEGACY_PROGRAMMING_SEED_IDS = new Set([
  'lesson-react-hooks',
  'lesson-nextjs-app-router',
  'lesson-js-event-loop',
  'lesson-ts-generics',
]);

// Seed lessons are no longer shipped; strip them from anyone who still has them.
const LEGACY_SEED_LESSON_IDS = new Set([
  'lesson-psych-clinical-assessment',
  'lesson-psych-sibling-relationships',
  'lesson-psych-maternal-depression',
]);

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'auto',
  fontSize: 'medium',
  examTimerMinutes: 5,
};

const DEFAULT_GAMIFICATION: GamificationStats = {
  xp: 0,
  streak: 1,
  lastActiveDate: getLocalDateKey(),
  examsCompleted: 0,
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors cleanly
  }
}

export function useLearningStore() {
  const [lessons, setLessons] = useState<Lesson[]>(() => {
    const saved = readStorage<Lesson[] | null>(KEYS.lessons, null);
    const savedV2 = saved ?? readStorage<Lesson[] | null>(KEYS.legacyLessonsV1, null);
    return (savedV2 ?? []).filter(
      (item) =>
        item && !LEGACY_SEED_LESSON_IDS.has(item.id) && !LEGACY_PROGRAMMING_SEED_IDS.has(item.id)
    );
  });

  const [progress, setProgress] = useState<Record<string, UserQuestionProgress>>(() =>
    readStorage<Record<string, UserQuestionProgress>>(KEYS.progress, {})
  );

  const [gamification, setGamification] = useState<GamificationStats>(() =>
    readStorage<GamificationStats>(KEYS.gamification, DEFAULT_GAMIFICATION)
  );

  const [examHistory, setExamHistory] = useState<ExamAttempt[]>(() =>
    readStorage<ExamAttempt[]>(KEYS.examHistory, [])
  );

  const [settings, setSettings] = useState<AppSettings>(() =>
    readStorage<AppSettings>(KEYS.settings, DEFAULT_SETTINGS)
  );

  const [activeLessonId, setActiveLessonId] = useState<string>(() =>
    readStorage<string>(KEYS.activeLessonId, '')
  );

  // Cloud Sync (Cloudflare Worker + D1) state
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(() => getStoredCloudUser());
  const [cloudToken, setCloudToken] = useState<string | null>(() => getStoredCloudToken());
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudLastSyncedAt, setCloudLastSyncedAt] = useState<number | null>(() =>
    getStoredLastSyncedAt()
  );
  const [cloudApiUrl, setCloudApiUrl] = useState<string>(() => getStoredApiBaseUrl());

  // Offline status + durable offline sync queue
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [offlineQueue, setOfflineQueue] = useState<OfflineSyncQueue>(() => getStoredOfflineQueue());
  const [reconnectSyncStatus, setReconnectSyncStatus] = useState<ReconnectSyncStatus>('idle');

  // Always keep fresh snapshot ref for async sync handlers
  const latestRef = useRef({
    lessons,
    progress,
    gamification,
    examHistory,
    cloudToken,
    isOnline,
    offlineQueue,
  });
  latestRef.current = {
    lessons,
    progress,
    gamification,
    examHistory,
    cloudToken,
    isOnline,
    offlineQueue,
  };

  const debouncedSyncTimerRef = useRef<number | null>(null);
  const syncedDismissTimerRef = useRef<number | null>(null);
  const flushingRef = useRef(false);

  // Sync activeLessonId if deleted
  useEffect(() => {
    if (lessons.length > 0 && !lessons.some((l) => l.id === activeLessonId)) {
      setActiveLessonId(lessons[0].id);
    }
  }, [lessons, activeLessonId]);

  useEffect(() => writeStorage(KEYS.lessons, lessons), [lessons]);
  useEffect(() => writeStorage(KEYS.progress, progress), [progress]);
  useEffect(() => writeStorage(KEYS.gamification, gamification), [gamification]);
  useEffect(() => writeStorage(KEYS.examHistory, examHistory), [examHistory]);
  useEffect(() => writeStorage(KEYS.settings, settings), [settings]);
  useEffect(() => writeStorage(KEYS.activeLessonId, activeLessonId), [activeLessonId]);

  useEffect(() => {
    return () => {
      if (debouncedSyncTimerRef.current !== null) {
        window.clearTimeout(debouncedSyncTimerRef.current);
      }
      if (syncedDismissTimerRef.current !== null) {
        window.clearTimeout(syncedDismissTimerRef.current);
      }
    };
  }, []);

  // Apply light/dark theme to <html> matching Rooznegar + Tailwind @custom-variant dark
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved =
        settings.theme === 'auto' ? (media.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.classList.toggle('dark', resolved === 'dark');
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute('content', resolved === 'dark' ? '#0c0e16' : '#f4f3f9');
      }
    };
    apply();
    if (settings.theme !== 'auto') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  const isCurrentlyOnline = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    return latestRef.current.isOnline;
  }, []);

  const enqueuePendingCloudChange = useCallback(
    (change: { lessonId?: string; deletedLessonId?: string } = {}) => {
      if (!latestRef.current.cloudToken) return;
      setOfflineQueue((prev) => {
        const next = enqueueOfflineChange(prev, change);
        saveOfflineQueue(next);
        latestRef.current.offlineQueue = next;
        return next;
      });
    },
    []
  );

  const clearPendingCloudQueue = useCallback(() => {
    clearOfflineQueue();
    const empty = { ...EMPTY_OFFLINE_QUEUE };
    latestRef.current.offlineQueue = empty;
    setOfflineQueue(empty);
  }, []);

  const dismissReconnectBanner = useCallback(() => {
    if (syncedDismissTimerRef.current !== null) {
      window.clearTimeout(syncedDismissTimerRef.current);
      syncedDismissTimerRef.current = null;
    }
    setReconnectSyncStatus('idle');
  }, []);

  const scheduleCloudPush = useCallback(
    (change: { lessonId?: string; deletedLessonId?: string } = {}) => {
      const token = latestRef.current.cloudToken;
      if (!token) return;

      if (!isCurrentlyOnline()) {
        if (debouncedSyncTimerRef.current !== null) {
          window.clearTimeout(debouncedSyncTimerRef.current);
          debouncedSyncTimerRef.current = null;
        }
        enqueuePendingCloudChange(change);
        return;
      }

      if (debouncedSyncTimerRef.current !== null) {
        window.clearTimeout(debouncedSyncTimerRef.current);
      }
      // Coalesce rapid edits, then push: every save must reach Cloudflare right away.
      debouncedSyncTimerRef.current = window.setTimeout(async () => {
        debouncedSyncTimerRef.current = null;
        const snap = latestRef.current;
        if (!snap.cloudToken) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueuePendingCloudChange(change);
          return;
        }
        try {
          await pushCloudSyncApi(snap.cloudToken, {
            lessons: snap.lessons,
            deletedLessons: getDeletedLessonRecords(),
            progress: snap.progress,
            gamification: snap.gamification,
            examHistory: snap.examHistory,
          });
          const now = Date.now();
          saveLastSyncedAt(now);
          setCloudLastSyncedAt(now);
          clearPendingCloudQueue();
        } catch {
          enqueuePendingCloudChange(change);
        }
      }, 300);
    },
    [clearPendingCloudQueue, enqueuePendingCloudChange, isCurrentlyOnline]
  );

  const performCloudSyncWithToken = useCallback(
    async (tokenOverride?: string): Promise<CloudSyncResult> => {
      const token = tokenOverride ?? latestRef.current.cloudToken;
      if (!token) {
        return { ok: false, message: 'ابتدا در بخش تنظیمات وارد حساب کلادفلر خود شوید.' };
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return {
          ok: false,
          message: 'شما آفلاین هستید؛ تغییرات ذخیره شده و به‌محض اتصال به اینترنت ارسال می‌شوند.',
        };
      }

      setCloudSyncing(true);
      try {
        const cloudData = await pullCloudSyncApi(token);
        const snap = latestRef.current;
        const localDeleted = getDeletedLessonRecords();

        const { merged, pulledNewCount, updatedFromCloudCount } = mergeFullCloudPayload(
          {
            lessons: snap.lessons,
            deletedLessons: localDeleted,
            progress: snap.progress,
            gamification: snap.gamification,
            examHistory: snap.examHistory,
          },
          cloudData
        );

        saveDeletedLessonRecords(merged.deletedLessons ?? []);
        const mergedLessons = merged.lessons.filter((l) => !LEGACY_SEED_LESSON_IDS.has(l.id));
        const removedSeedIds = merged.lessons
          .filter((l) => LEGACY_SEED_LESSON_IDS.has(l.id))
          .map((l) => l.id);
        const syncPayload = {
          ...merged,
          lessons: mergedLessons,
          deletedLessons: [
            ...(merged.deletedLessons ?? []),
            ...removedSeedIds.map((id) => ({ id, deletedAt: Date.now() })),
          ],
        };
        setLessons(mergedLessons);
        setProgress(merged.progress);
        setGamification(merged.gamification);
        setExamHistory(merged.examHistory);

        const pushRes = await pushCloudSyncApi(token, syncPayload);
        const now = Date.now();
        saveLastSyncedAt(now);
        setCloudLastSyncedAt(now);
        clearPendingCloudQueue();

        const pulledTotal = pulledNewCount + updatedFromCloudCount;
        const msg =
          pulledTotal > 0
            ? `همگام‌سازی با کلادفلر انجام شد (${toPersianDigits(pulledTotal)} درس از ابر دریافت و ${toPersianDigits(merged.lessons.length)} درس ذخیره شد).`
            : `همگام‌سازی کامل با کلادفلر انجام شد (${toPersianDigits(pushRes.syncedLessons || merged.lessons.length)} درس روی ابر ذخیره است).`;

        return {
          ok: true,
          message: msg,
          pushedLessons: merged.lessons.length,
          pulledLessons: pulledTotal,
          syncedAt: now,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'خطا در همگام‌سازی با کلادفلر.',
        };
      } finally {
        setCloudSyncing(false);
      }
    },
    [clearPendingCloudQueue]
  );

  const flushOfflineQueue = useCallback(async () => {
    const onlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const ready = shouldFlushOfflineQueue({
      isOnline: onlineNow,
      hasAuthToken: Boolean(latestRef.current.cloudToken),
      queue: latestRef.current.offlineQueue,
      isSyncing: flushingRef.current,
    });
    if (!ready) return;

    flushingRef.current = true;
    if (syncedDismissTimerRef.current !== null) {
      window.clearTimeout(syncedDismissTimerRef.current);
      syncedDismissTimerRef.current = null;
    }
    setReconnectSyncStatus('syncing');

    try {
      const res = await performCloudSyncWithToken();
      if (res.ok) {
        setReconnectSyncStatus('synced');
        syncedDismissTimerRef.current = window.setTimeout(() => {
          setReconnectSyncStatus('idle');
          syncedDismissTimerRef.current = null;
        }, 4500);
      } else {
        setReconnectSyncStatus('idle');
      }
    } finally {
      flushingRef.current = false;
    }
  }, [performCloudSyncWithToken]);

  // Listen to browser online / offline events & flush queued changes immediately upon reconnect
  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      latestRef.current.isOnline = false;
      setReconnectSyncStatus('idle');
      if (debouncedSyncTimerRef.current !== null) {
        window.clearTimeout(debouncedSyncTimerRef.current);
        debouncedSyncTimerRef.current = null;
        enqueuePendingCloudChange({});
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      latestRef.current.isOnline = true;
      void flushOfflineQueue();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Flush any leftover offline edits from a previous session if app starts online
    if (typeof navigator === 'undefined' || navigator.onLine) {
      void flushOfflineQueue();
    }

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [enqueuePendingCloudChange, flushOfflineQueue]);

  const pushAllLessonsToCloud = useCallback(async (): Promise<CloudSyncResult> => {
    const token = latestRef.current.cloudToken;
    if (!token) {
      return { ok: false, message: 'برای ارسال درس‌ها به کلادفلر ابتدا وارد حساب شوید.' };
    }
    if (!isCurrentlyOnline()) {
      enqueuePendingCloudChange({});
      return {
        ok: false,
        message: 'شما آفلاین هستید؛ تغییرات ذخیره شده و به‌محض اتصال به اینترنت ارسال می‌شوند.',
      };
    }
    setCloudSyncing(true);
    try {
      const snap = latestRef.current;
      const res = await pushCloudSyncApi(token, {
        lessons: snap.lessons,
        deletedLessons: getDeletedLessonRecords(),
        progress: snap.progress,
        gamification: snap.gamification,
        examHistory: snap.examHistory,
      });
      const now = Date.now();
      saveLastSyncedAt(now);
      setCloudLastSyncedAt(now);
      clearPendingCloudQueue();
      return {
        ok: true,
        message: `تمام ${toPersianDigits(res.syncedLessons || snap.lessons.length)} درس با موفقیت روی کلادفلر ذخیره شد.`,
        pushedLessons: snap.lessons.length,
        syncedAt: now,
      };
    } catch (err) {
      enqueuePendingCloudChange({});
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'ارسال درس‌ها به کلادفلر ناموفق بود.',
      };
    } finally {
      setCloudSyncing(false);
    }
  }, [clearPendingCloudQueue, enqueuePendingCloudChange, isCurrentlyOnline]);

  const pushLessonToCloud = useCallback(
    async (lesson: Lesson): Promise<CloudSyncResult> => {
      const token = latestRef.current.cloudToken;
      if (!token) {
        return { ok: false, message: 'برای ذخیره درس روی کلادفلر، ابتدا در تنظیمات وارد حساب شوید.' };
      }
      if (!isCurrentlyOnline()) {
        enqueuePendingCloudChange({ lessonId: lesson.id });
        return {
          ok: false,
          message: `شما آفلاین هستید؛ درس «${lesson.title}» در صف ارسال خودکار پس از اتصال قرار گرفت.`,
        };
      }
      setCloudSyncing(true);
      try {
        const payload: Lesson = {
          ...lesson,
          updatedAt: lesson.updatedAt || Date.now(),
        };
        await pushSingleLessonApi(token, payload);
        const now = Date.now();
        saveLastSyncedAt(now);
        setCloudLastSyncedAt(now);
        return {
          ok: true,
          message: `درس «${lesson.title}» با موفقیت روی کلادفلر ذخیره شد.`,
          pushedLessons: 1,
          syncedAt: now,
        };
      } catch (err) {
        enqueuePendingCloudChange({ lessonId: lesson.id });
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'خطا در ارسال درس به کلادفلر.',
        };
      } finally {
        setCloudSyncing(false);
      }
    },
    [enqueuePendingCloudChange, isCurrentlyOnline]
  );

  const registerToCloud = useCallback(
    async (
      email: string,
      password: string,
      name?: string,
      website?: string
    ): Promise<CloudSyncResult> => {
      if (!isCurrentlyOnline()) {
        return {
          ok: false,
          message: 'اتصال اینترنت برقرار نیست. برای ثبت‌نام در کلادفلر ابتدا به اینترنت متصل شوید.',
        };
      }
      try {
        const res = await registerApi(email, password, name, { website });
        saveCloudSession(res.user, res.token);
        setCloudUser(res.user);
        setCloudToken(res.token);
        latestRef.current.cloudToken = res.token;
        const syncRes = await performCloudSyncWithToken(res.token);
        return {
          ok: true,
          message: syncRes.ok
            ? `حساب «${res.user.name}» ساخته شد و ${syncRes.pushedLessons ?? latestRef.current.lessons.length} درس به کلادفلر ارسال گردید.`
            : `حساب «${res.user.name}» ساخته شد.`,
          syncedAt: syncRes.syncedAt,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'ثبت‌نام ناموفق بود.',
        };
      }
    },
    [isCurrentlyOnline, performCloudSyncWithToken]
  );

  const loginToCloud = useCallback(
    async (email: string, password: string): Promise<CloudSyncResult> => {
      if (!isCurrentlyOnline()) {
        return {
          ok: false,
          message: 'اتصال اینترنت برقرار نیست. برای ورود به حساب کلادفلر ابتدا به اینترنت متصل شوید.',
        };
      }
      try {
        const res = await loginApi(email, password);
        saveCloudSession(res.user, res.token);
        setCloudUser(res.user);
        setCloudToken(res.token);
        latestRef.current.cloudToken = res.token;
        const syncRes = await performCloudSyncWithToken(res.token);
        return {
          ok: true,
          message: syncRes.ok
            ? `خوش آمدید ${res.user.name} — ${syncRes.message}`
            : `خوش آمدید ${res.user.name}`,
          pulledLessons: syncRes.pulledLessons,
          pushedLessons: syncRes.pushedLessons,
          syncedAt: syncRes.syncedAt,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'ورود به حساب ناموفق بود.',
        };
      }
    },
    [isCurrentlyOnline, performCloudSyncWithToken]
  );

  const logoutFromCloud = useCallback(() => {
    clearCloudSession();
    clearPendingCloudQueue();
    dismissReconnectBanner();
    setCloudUser(null);
    setCloudToken(null);
    latestRef.current.cloudToken = null;
    setCloudLastSyncedAt(null);
  }, [clearPendingCloudQueue, dismissReconnectBanner]);

  const updateCloudApiUrl = useCallback((url: string): string => {
    const normalized = setStoredApiBaseUrl(url);
    setCloudApiUrl(normalized);
    return normalized;
  }, []);

  const testCloudConnection = useCallback(
    async (overrideUrl?: string): Promise<{ ok: boolean; message: string }> => {
      if (!isCurrentlyOnline()) {
        return {
          ok: false,
          message: 'شما آفلاین هستید؛ پس از اتصال به اینترنت وضعیت سرور را تست کنید.',
        };
      }
      try {
        const res = await healthCheckApi(overrideUrl);
        if (res.ok) {
          return {
            ok: true,
            message:
              res.provider === 'cloudflare-worker'
                ? 'اتصال به Cloudflare Worker با موفقیت برقرار شد.'
                : 'اتصال به سرور ابری برقرار است و آماده ذخیره و همگام‌سازی است.',
          };
        }
        return { ok: false, message: 'پاسخ معتبری از سرور دریافت نشد.' };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'برقراری ارتباط با سرور ناموفق بود.',
        };
      }
    },
    [isCurrentlyOnline]
  );

  const addLesson = useCallback(
    (newLesson: Lesson) => {
      latestRef.current.lessons = [newLesson, ...latestRef.current.lessons];
      setLessons((prev) => [newLesson, ...prev]);
      setActiveLessonId(newLesson.id);
      if (!latestRef.current.cloudToken) return;
      if (!isCurrentlyOnline()) {
        enqueuePendingCloudChange({ lessonId: newLesson.id });
        return;
      }
      void pushSingleLessonApi(latestRef.current.cloudToken, newLesson)
        .then(() => {
          const now = Date.now();
          saveLastSyncedAt(now);
          setCloudLastSyncedAt(now);
        })
        .catch(() => {
          enqueuePendingCloudChange({ lessonId: newLesson.id });
        });
    },
    [enqueuePendingCloudChange, isCurrentlyOnline]
  );

  const addLessonsBatch = useCallback(
    (incoming: Lesson[]) => {
      if (incoming.length === 0) return;
      latestRef.current.lessons = [...incoming, ...latestRef.current.lessons];
      setLessons((prev) => [...incoming, ...prev]);
      setActiveLessonId(incoming[0].id);
      scheduleCloudPush({ lessonId: incoming[0].id });
    },
    [scheduleCloudPush]
  );

  const updateLesson = useCallback(
    (updated: Lesson) => {
      latestRef.current.lessons = latestRef.current.lessons.map((item) =>
        item.id === updated.id ? updated : item
      );
      setLessons((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (!latestRef.current.cloudToken) return;
      if (!isCurrentlyOnline()) {
        enqueuePendingCloudChange({ lessonId: updated.id });
        return;
      }
      void pushSingleLessonApi(latestRef.current.cloudToken, updated)
        .then(() => {
          const now = Date.now();
          saveLastSyncedAt(now);
          setCloudLastSyncedAt(now);
        })
        .catch(() => {
          enqueuePendingCloudChange({ lessonId: updated.id });
        });
    },
    [enqueuePendingCloudChange, isCurrentlyOnline]
  );

  const deleteLesson = useCallback(
    (lessonId: string) => {
      latestRef.current.lessons = latestRef.current.lessons.filter(
        (item) => item.id !== lessonId
      );
      setLessons((prev) => prev.filter((item) => item.id !== lessonId));
      recordDeletedLesson(lessonId);
      if (!latestRef.current.cloudToken) return;
      if (!isCurrentlyOnline()) {
        enqueuePendingCloudChange({ deletedLessonId: lessonId });
        return;
      }
      void deleteCloudLessonApi(latestRef.current.cloudToken, lessonId)
        .then(() => {
          const now = Date.now();
          saveLastSyncedAt(now);
          setCloudLastSyncedAt(now);
        })
        .catch(() => {
          enqueuePendingCloudChange({ deletedLessonId: lessonId });
        });
    },
    [enqueuePendingCloudChange, isCurrentlyOnline]
  );

  const addQuestionToLesson = useCallback(
    (lessonId: string, question: LessonQuestion) => {
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          const updatedChapters = lesson.chapters
            ? lesson.chapters.map((ch, idx) => {
                const targetMatch = question.chapterId
                  ? ch.id === question.chapterId
                  : idx === 0;
                return targetMatch
                  ? {
                      ...ch,
                      questions: [
                        ...ch.questions,
                        { ...question, chapterId: ch.id, chapterTitle: ch.title },
                      ],
                    }
                  : ch;
              })
            : undefined;
          return {
            ...lesson,
            updatedAt: Date.now(),
            chapters: updatedChapters,
            questions: [...lesson.questions, question],
          };
        })
      );
      scheduleCloudPush({ lessonId });
    },
    [scheduleCloudPush]
  );

  const saveClassNote = useCallback(
    (lessonId: string, note: ClassNote) => {
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          const existing = lesson.classNotes ?? [];
          const exists = existing.some((item) => item.id === note.id);
          const nextNotes = exists
            ? existing.map((item) => (item.id === note.id ? note : item))
            : [note, ...existing];
          return {
            ...lesson,
            updatedAt: Date.now(),
            classNotes: nextNotes,
          };
        })
      );
      scheduleCloudPush({ lessonId });
    },
    [scheduleCloudPush]
  );

  const deleteClassNote = useCallback(
    (lessonId: string, noteId: string) => {
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          return {
            ...lesson,
            updatedAt: Date.now(),
            classNotes: (lesson.classNotes ?? []).filter((item) => item.id !== noteId),
          };
        })
      );
      scheduleCloudPush({ lessonId });
    },
    [scheduleCloudPush]
  );

  const saveCourseOverview = useCallback(
    (lessonId: string, courseOverview: string) => {
      setLessons((prev) =>
        prev.map((lesson) =>
          lesson.id === lessonId
            ? {
                ...lesson,
                courseOverview,
                updatedAt: Date.now(),
              }
            : lesson
        )
      );
      scheduleCloudPush({ lessonId });
    },
    [scheduleCloudPush]
  );

  const addTextHighlights = useCallback(
    (lessonId: string, incoming: TextHighlight[]) => {
      if (incoming.length === 0) return;
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          let nextHighlights = [...(lesson.highlights ?? [])];
          for (const inc of incoming) {
            if (inc.endOffset <= inc.startOffset) continue;
            const kept: TextHighlight[] = [];
            for (const cur of nextHighlights) {
              const sameTarget =
                cur.scopeKey === inc.scopeKey &&
                cur.blockIndex === inc.blockIndex &&
                (cur.itemIndex ?? -1) === (inc.itemIndex ?? -1);
              if (!sameTarget || cur.endOffset <= inc.startOffset || cur.startOffset >= inc.endOffset) {
                kept.push(cur);
                continue;
              }
              if (cur.startOffset < inc.startOffset) {
                const leftLen = inc.startOffset - cur.startOffset;
                kept.push({
                  ...cur,
                  id: `${cur.id}-l-${inc.createdAt}`,
                  endOffset: inc.startOffset,
                  text: cur.text.slice(0, leftLen),
                });
              }
              if (cur.endOffset > inc.endOffset) {
                const trimLeft = inc.endOffset - cur.startOffset;
                kept.push({
                  ...cur,
                  id: `${cur.id}-r-${inc.createdAt}`,
                  startOffset: inc.endOffset,
                  text: cur.text.slice(trimLeft),
                });
              }
            }
            kept.push(inc);
            nextHighlights = kept;
          }
          nextHighlights.sort(
            (a, b) =>
              a.blockIndex - b.blockIndex ||
              (a.itemIndex ?? -1) - (b.itemIndex ?? -1) ||
              a.startOffset - b.startOffset
          );
          return {
            ...lesson,
            highlights: nextHighlights,
            updatedAt: Date.now(),
          };
        })
      );
      scheduleCloudPush({ lessonId });
    },
    [scheduleCloudPush]
  );

  const updateTextHighlightColor = useCallback(
    (lessonId: string, highlightId: string, color: HighlightColor) => {
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          const existing = lesson.highlights ?? [];
          if (!existing.some((h) => h.id === highlightId)) return lesson;
          return {
            ...lesson,
            highlights: existing.map((h) => (h.id === highlightId ? { ...h, color } : h)),
            updatedAt: Date.now(),
          };
        })
      );
      scheduleCloudPush({ lessonId });
    },
    [scheduleCloudPush]
  );

  const removeTextHighlights = useCallback(
    (lessonId: string, highlightIds: string[]) => {
      if (highlightIds.length === 0) return;
      const idSet = new Set(highlightIds);
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          const existing = lesson.highlights ?? [];
          const filtered = existing.filter((h) => !idSet.has(h.id));
          if (filtered.length === existing.length) return lesson;
          return {
            ...lesson,
            highlights: filtered,
            updatedAt: Date.now(),
          };
        })
      );
      scheduleCloudPush({ lessonId });
    },
    [scheduleCloudPush]
  );

  const markQuestionState = useCallback(
    (questionId: string, state: QuestionProgressState, xpDelta: number = 0) => {
      setProgress((prev) => ({
        ...prev,
        [questionId]: { state, updatedAt: Date.now() },
      }));
      if (xpDelta !== 0) {
        setGamification((prev) => updateGamificationOnActivity(prev, xpDelta));
      }
      scheduleCloudPush();
    },
    [scheduleCloudPush]
  );

  const markManyQuestionsState = useCallback(
    (questionIds: string[], state: QuestionProgressState) => {
      if (questionIds.length === 0) return;
      const now = Date.now();
      setProgress((prev) => {
        const next = { ...prev };
        for (const id of questionIds) {
          next[id] = { state, updatedAt: now };
        }
        return next;
      });
      scheduleCloudPush();
    },
    [scheduleCloudPush]
  );

  const recordExamAttempt = useCallback(
    (attempt: ExamAttempt) => {
      setExamHistory((prev) => [attempt, ...prev].slice(0, 30));
      setGamification((prev) =>
        updateGamificationOnActivity(prev, attempt.xpEarned, getLocalDateKey(), true)
      );
      setProgress((prev) => {
        const next = { ...prev };
        const now = Date.now();
        for (const wrongId of attempt.wrongQuestionIds) {
          next[wrongId] = { state: 'want_to_learn', updatedAt: now };
        }
        return next;
      });
      scheduleCloudPush();
    },
    [scheduleCloudPush]
  );

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const exportBackupJson = useCallback(() => {
    const payload = createBackupPayload({
      lessons,
      progress,
      gamification,
      examHistory,
      settings,
    });
    return JSON.stringify(payload, null, 2);
  }, [lessons, progress, gamification, examHistory, settings]);

  const importBackupJson = useCallback(
    (rawText: string): { ok: boolean; message: string } => {
      try {
        const parsed: unknown = JSON.parse(rawText);
        if (!validateBackupPayload(parsed)) {
          return { ok: false, message: 'ساختار فایل پشتیبان معتبر نیست.' };
        }
        setLessons(parsed.lessons);
        setProgress(parsed.progress);
        setGamification(parsed.gamification);
        setExamHistory(parsed.examHistory ?? []);
        setSettings(parsed.settings);
        if (parsed.lessons.length > 0) {
          setActiveLessonId(parsed.lessons[0].id);
        }
        scheduleCloudPush();
        return { ok: true, message: 'نسخه پشتیبان با موفقیت بازیابی شد.' };
      } catch {
        return { ok: false, message: 'فایل JSON قابل خواندن نیست.' };
      }
    },
    [scheduleCloudPush]
  );

  const resetProgressOnly = useCallback(() => {
    setProgress({});
    setExamHistory([]);
    setGamification({
      xp: 0,
      streak: 1,
      lastActiveDate: getLocalDateKey(),
      examsCompleted: 0,
    });
    scheduleCloudPush();
  }, [scheduleCloudPush]);

  return {
    lessons,
    progress,
    gamification,
    examHistory,
    settings,
    activeLessonId,
    setActiveLessonId,
    addLesson,
    addLessonsBatch,
    updateLesson,
    deleteLesson,
    addQuestionToLesson,
    saveClassNote,
    deleteClassNote,
    saveCourseOverview,
    addTextHighlights,
    updateTextHighlightColor,
    removeTextHighlights,
    markQuestionState,
    markManyQuestionsState,
    recordExamAttempt,
    updateSettings,
    exportBackupJson,
    importBackupJson,
    resetProgressOnly,
    // Cloud Sync (Cloudflare Worker + D1) & Offline Queue
    cloudUser,
    cloudToken,
    cloudSyncing,
    cloudLastSyncedAt,
    cloudApiUrl,
    isOnline,
    offlineQueue,
    reconnectSyncStatus,
    dismissReconnectBanner,
    flushOfflineQueue,
    registerToCloud,
    loginToCloud,
    logoutFromCloud,
    performCloudSync: () => performCloudSyncWithToken(),
    pushAllLessonsToCloud,
    pushLessonToCloud,
    updateCloudApiUrl,
    testCloudConnection,
  };
}
