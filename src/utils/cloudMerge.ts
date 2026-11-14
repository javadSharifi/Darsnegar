import type {
  CloudSyncPayload,
  DeletedLessonRecord,
  ExamAttempt,
  GamificationStats,
  Lesson,
  UserQuestionProgress,
} from '../types/learning';

export function mergeDeletedLessonRecords(
  localDeleted: DeletedLessonRecord[],
  cloudDeleted: DeletedLessonRecord[] = []
): DeletedLessonRecord[] {
  const map = new Map<string, number>();
  for (const item of localDeleted) {
    if (!item || typeof item.id !== 'string') continue;
    const prev = map.get(item.id) ?? 0;
    if (item.deletedAt > prev) {
      map.set(item.id, item.deletedAt);
    }
  }
  for (const item of cloudDeleted) {
    if (!item || typeof item.id !== 'string') continue;
    const prev = map.get(item.id) ?? 0;
    if (item.deletedAt > prev) {
      map.set(item.id, item.deletedAt);
    }
  }
  return Array.from(map.entries()).map(([id, deletedAt]) => ({ id, deletedAt }));
}

export function mergeLessons(
  localLessons: Lesson[],
  cloudLessons: Lesson[],
  deletedRecords: DeletedLessonRecord[] = []
): { merged: Lesson[]; pulledNewCount: number; updatedFromCloudCount: number } {
  const deletedAtMap = new Map<string, number>();
  for (const rec of deletedRecords) {
    const prev = deletedAtMap.get(rec.id) ?? 0;
    if (rec.deletedAt > prev) deletedAtMap.set(rec.id, rec.deletedAt);
  }

  const byId = new Map<string, Lesson>();
  for (const lesson of localLessons) {
    if (!lesson || typeof lesson.id !== 'string') continue;
    const delAt = deletedAtMap.get(lesson.id);
    if (delAt && delAt >= (lesson.updatedAt || 0)) continue;
    byId.set(lesson.id, lesson);
  }

  let pulledNewCount = 0;
  let updatedFromCloudCount = 0;

  for (const cloudLesson of cloudLessons) {
    if (!cloudLesson || typeof cloudLesson.id !== 'string') continue;
    const delAt = deletedAtMap.get(cloudLesson.id);
    if (delAt && delAt >= (cloudLesson.updatedAt || 0)) continue;

    const existing = byId.get(cloudLesson.id);
    if (!existing) {
      byId.set(cloudLesson.id, cloudLesson);
      pulledNewCount += 1;
    } else if ((cloudLesson.updatedAt || 0) > (existing.updatedAt || 0)) {
      byId.set(cloudLesson.id, cloudLesson);
      updatedFromCloudCount += 1;
    }
  }

  // Keep custom lessons ordered most-recently-updated first, followed by built-in lessons in stable order
  const merged = Array.from(byId.values()).sort((a, b) => {
    const aCustom = Boolean(a.isCustom);
    const bCustom = Boolean(b.isCustom);
    if (aCustom !== bCustom) return aCustom ? -1 : 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  return { merged, pulledNewCount, updatedFromCloudCount };
}

export function mergeProgress(
  localProgress: Record<string, UserQuestionProgress>,
  cloudProgress: Record<string, UserQuestionProgress>
): Record<string, UserQuestionProgress> {
  const merged: Record<string, UserQuestionProgress> = { ...localProgress };
  for (const [qId, cloudEntry] of Object.entries(cloudProgress)) {
    if (!cloudEntry || typeof cloudEntry.state !== 'string') continue;
    const localEntry = merged[qId];
    if (!localEntry || (cloudEntry.updatedAt || 0) > (localEntry.updatedAt || 0)) {
      merged[qId] = {
        state: cloudEntry.state,
        updatedAt: cloudEntry.updatedAt || Date.now(),
      };
    }
  }
  return merged;
}

export function mergeGamification(
  local: GamificationStats,
  cloud?: Partial<GamificationStats> | null
): GamificationStats {
  if (!cloud) return local;
  const localDate = local.lastActiveDate || '';
  const cloudDate = cloud.lastActiveDate || '';
  return {
    xp: Math.max(local.xp || 0, cloud.xp || 0),
    streak: Math.max(local.streak || 0, cloud.streak || 0),
    examsCompleted: Math.max(local.examsCompleted || 0, cloud.examsCompleted || 0),
    lastActiveDate: localDate >= cloudDate ? localDate : cloudDate,
  };
}

export function mergeExamHistory(
  localExams: ExamAttempt[],
  cloudExams: ExamAttempt[] = []
): ExamAttempt[] {
  const byId = new Map<string, ExamAttempt>();
  for (const attempt of [...localExams, ...cloudExams]) {
    if (!attempt || typeof attempt.id !== 'string') continue;
    if (!byId.has(attempt.id)) {
      byId.set(attempt.id, attempt);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
    .slice(0, 30);
}

export function mergeFullCloudPayload(
  local: CloudSyncPayload,
  cloud: Partial<CloudSyncPayload>
): {
  merged: CloudSyncPayload;
  pulledNewCount: number;
  updatedFromCloudCount: number;
} {
  const deletedLessons = mergeDeletedLessonRecords(
    local.deletedLessons ?? [],
    cloud.deletedLessons ?? []
  );
  const lessonsResult = mergeLessons(
    local.lessons,
    cloud.lessons ?? [],
    deletedLessons
  );
  const progress = mergeProgress(local.progress, cloud.progress ?? {});
  const gamification = mergeGamification(local.gamification, cloud.gamification);
  const examHistory = mergeExamHistory(local.examHistory, cloud.examHistory ?? []);

  return {
    merged: {
      lessons: lessonsResult.merged,
      deletedLessons,
      progress,
      gamification,
      examHistory,
    },
    pulledNewCount: lessonsResult.pulledNewCount,
    updatedFromCloudCount: lessonsResult.updatedFromCloudCount,
  };
}
