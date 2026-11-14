import { useCallback, useEffect, useRef, useState } from 'react';
import { SEED_LESSONS } from '../data/seedLessons';
import type {
  AppSettings,
  ClassNote,
  CloudSyncResult,
  CloudUser,
  ExamAttempt,
  GamificationStats,
  Lesson,
  LessonQuestion,
  QuestionProgressState,
  UserQuestionProgress,
} from '../types/learning';
import {
  clearCloudSession,
  deleteCloudLessonApi,
  getDeletedLessonRecords,
  getStoredApiBaseUrl,
  getStoredCloudToken,
  getStoredCloudUser,
  getStoredLastSyncedAt,
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
  setStoredApiBaseUrl,
} from '../services/cloudflareApi';
import { mergeFullCloudPayload } from '../utils/cloudMerge';
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
    const savedV2 = readStorage<Lesson[] | null>(KEYS.lessons, null);
    if (savedV2 && savedV2.length > 0) return savedV2;

    // Migrate any custom lessons created under v1, while replacing old programming defaults
    const legacyV1 = readStorage<Lesson[] | null>(KEYS.legacyLessonsV1, null);
    const customFromV1 = (legacyV1 ?? []).filter(
      (item) => item && !LEGACY_PROGRAMMING_SEED_IDS.has(item.id)
    );
    return customFromV1.length > 0 ? [...customFromV1, ...SEED_LESSONS] : SEED_LESSONS;
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

  const [activeLessonId, setActiveLessonId] = useState<string>(() => {
    const savedId = readStorage<string>(KEYS.activeLessonId, '');
    return savedId || SEED_LESSONS[0].id;
  });

  // Cloud Sync (Cloudflare Worker + D1) state
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(() => getStoredCloudUser());
  const [cloudToken, setCloudToken] = useState<string | null>(() => getStoredCloudToken());
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudLastSyncedAt, setCloudLastSyncedAt] = useState<number | null>(() =>
    getStoredLastSyncedAt()
  );
  const [cloudApiUrl, setCloudApiUrl] = useState<string>(() => getStoredApiBaseUrl());

  // Always keep fresh snapshot ref for async sync handlers
  const latestRef = useRef({
    lessons,
    progress,
    gamification,
    examHistory,
    cloudToken,
  });
  latestRef.current = {
    lessons,
    progress,
    gamification,
    examHistory,
    cloudToken,
  };

  const debouncedSyncTimerRef = useRef<number | null>(null);

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

  const scheduleCloudPush = useCallback(() => {
    const token = latestRef.current.cloudToken;
    if (!token) return;
    if (debouncedSyncTimerRef.current !== null) {
      window.clearTimeout(debouncedSyncTimerRef.current);
    }
    debouncedSyncTimerRef.current = window.setTimeout(async () => {
      debouncedSyncTimerRef.current = null;
      const snap = latestRef.current;
      if (!snap.cloudToken) return;
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
      } catch {
        // Silent background retry via manual sync
      }
    }, 1800);
  }, []);

  const performCloudSyncWithToken = useCallback(
    async (tokenOverride?: string): Promise<CloudSyncResult> => {
      const token = tokenOverride ?? latestRef.current.cloudToken;
      if (!token) {
        return { ok: false, message: 'ابتدا در بخش تنظیمات وارد حساب کلادفلر خود شوید.' };
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
        setLessons(merged.lessons);
        setProgress(merged.progress);
        setGamification(merged.gamification);
        setExamHistory(merged.examHistory);

        const pushRes = await pushCloudSyncApi(token, merged);
        const now = Date.now();
        saveLastSyncedAt(now);
        setCloudLastSyncedAt(now);

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
    []
  );

  const pushAllLessonsToCloud = useCallback(async (): Promise<CloudSyncResult> => {
    const token = latestRef.current.cloudToken;
    if (!token) {
      return { ok: false, message: 'برای ارسال درس‌ها به کلادفلر ابتدا وارد حساب شوید.' };
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
      return {
        ok: true,
        message: `تمام ${toPersianDigits(res.syncedLessons || snap.lessons.length)} درس با موفقیت روی کلادفلر ذخیره شد.`,
        pushedLessons: snap.lessons.length,
        syncedAt: now,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'ارسال درس‌ها به کلادفلر ناموفق بود.',
      };
    } finally {
      setCloudSyncing(false);
    }
  }, []);

  const pushLessonToCloud = useCallback(async (lesson: Lesson): Promise<CloudSyncResult> => {
    const token = latestRef.current.cloudToken;
    if (!token) {
      return { ok: false, message: 'برای ذخیره درس روی کلادفلر، ابتدا در تنظیمات وارد حساب شوید.' };
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
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'خطا در ارسال درس به کلادفلر.',
      };
    } finally {
      setCloudSyncing(false);
    }
  }, []);

  const registerToCloud = useCallback(
    async (
      email: string,
      password: string,
      name?: string,
      website?: string
    ): Promise<CloudSyncResult> => {
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
    [performCloudSyncWithToken]
  );

  const loginToCloud = useCallback(
    async (email: string, password: string): Promise<CloudSyncResult> => {
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
    [performCloudSyncWithToken]
  );

  const logoutFromCloud = useCallback(() => {
    clearCloudSession();
    setCloudUser(null);
    setCloudToken(null);
    setCloudLastSyncedAt(null);
  }, []);

  const updateCloudApiUrl = useCallback((url: string): string => {
    const normalized = setStoredApiBaseUrl(url);
    setCloudApiUrl(normalized);
    return normalized;
  }, []);

  const testCloudConnection = useCallback(
    async (overrideUrl?: string): Promise<{ ok: boolean; message: string }> => {
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
    []
  );

  const addLesson = useCallback((newLesson: Lesson) => {
    setLessons((prev) => [newLesson, ...prev]);
    setActiveLessonId(newLesson.id);
    if (latestRef.current.cloudToken) {
      void pushSingleLessonApi(latestRef.current.cloudToken, newLesson)
        .then(() => {
          const now = Date.now();
          saveLastSyncedAt(now);
          setCloudLastSyncedAt(now);
        })
        .catch(() => {
          // Will sync on next full sync
        });
    }
  }, []);

  const addLessonsBatch = useCallback(
    (incoming: Lesson[]) => {
      if (incoming.length === 0) return;
      setLessons((prev) => [...incoming, ...prev]);
      setActiveLessonId(incoming[0].id);
      scheduleCloudPush();
    },
    [scheduleCloudPush]
  );

  const updateLesson = useCallback((updated: Lesson) => {
    setLessons((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    if (latestRef.current.cloudToken) {
      void pushSingleLessonApi(latestRef.current.cloudToken, updated)
        .then(() => {
          const now = Date.now();
          saveLastSyncedAt(now);
          setCloudLastSyncedAt(now);
        })
        .catch(() => {
          // Will sync on next full sync
        });
    }
  }, []);

  const deleteLesson = useCallback((lessonId: string) => {
    setLessons((prev) => prev.filter((item) => item.id !== lessonId));
    recordDeletedLesson(lessonId);
    if (latestRef.current.cloudToken) {
      void deleteCloudLessonApi(latestRef.current.cloudToken, lessonId)
        .then(() => {
          const now = Date.now();
          saveLastSyncedAt(now);
          setCloudLastSyncedAt(now);
        })
        .catch(() => {
          // Tombstone remains recorded locally for next sync
        });
    }
  }, []);

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
      scheduleCloudPush();
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
      scheduleCloudPush();
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
      scheduleCloudPush();
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
      scheduleCloudPush();
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

  const restoreDefaultLessons = useCallback(() => {
    setLessons(SEED_LESSONS);
    setActiveLessonId(SEED_LESSONS[0].id);
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
    markQuestionState,
    markManyQuestionsState,
    recordExamAttempt,
    updateSettings,
    exportBackupJson,
    importBackupJson,
    resetProgressOnly,
    restoreDefaultLessons,
    // Cloud Sync (Cloudflare Worker + D1)
    cloudUser,
    cloudToken,
    cloudSyncing,
    cloudLastSyncedAt,
    cloudApiUrl,
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
