export interface OfflineSyncQueue {
  dirty: boolean;
  pendingLessonIds: string[];
  pendingDeletedIds: string[];
  pendingChangesCount: number;
  lastModifiedAt: number;
}

export const EMPTY_OFFLINE_QUEUE: OfflineSyncQueue = {
  dirty: false,
  pendingLessonIds: [],
  pendingDeletedIds: [],
  pendingChangesCount: 0,
  lastModifiedAt: 0,
};

export function normalizeOfflineQueue(raw: unknown): OfflineSyncQueue {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_OFFLINE_QUEUE };
  const candidate = raw as Partial<OfflineSyncQueue>;
  const pendingLessonIds = Array.isArray(candidate.pendingLessonIds)
    ? candidate.pendingLessonIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const pendingDeletedIds = Array.isArray(candidate.pendingDeletedIds)
    ? candidate.pendingDeletedIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const pendingChangesCount =
    typeof candidate.pendingChangesCount === 'number' && candidate.pendingChangesCount >= 0
      ? candidate.pendingChangesCount
      : pendingLessonIds.length + pendingDeletedIds.length;
  const dirty = Boolean(candidate.dirty) || pendingChangesCount > 0;
  const lastModifiedAt =
    typeof candidate.lastModifiedAt === 'number' ? candidate.lastModifiedAt : 0;

  return {
    dirty,
    pendingLessonIds,
    pendingDeletedIds,
    pendingChangesCount,
    lastModifiedAt,
  };
}

export function enqueueOfflineChange(
  current: OfflineSyncQueue,
  change: {
    lessonId?: string;
    deletedLessonId?: string;
    timestamp?: number;
  } = {}
): OfflineSyncQueue {
  const lessonSet = new Set(current.pendingLessonIds);
  const deletedSet = new Set(current.pendingDeletedIds);

  if (change.lessonId) {
    lessonSet.add(change.lessonId);
    deletedSet.delete(change.lessonId);
  }

  if (change.deletedLessonId) {
    deletedSet.add(change.deletedLessonId);
    lessonSet.delete(change.deletedLessonId);
  }

  return {
    dirty: true,
    pendingLessonIds: Array.from(lessonSet),
    pendingDeletedIds: Array.from(deletedSet),
    pendingChangesCount: current.pendingChangesCount + 1,
    lastModifiedAt: change.timestamp ?? Date.now(),
  };
}

export function shouldFlushOfflineQueue(params: {
  isOnline: boolean;
  hasAuthToken: boolean;
  queue: OfflineSyncQueue;
  isSyncing: boolean;
}): boolean {
  if (!params.isOnline) return false;
  if (!params.hasAuthToken) return false;
  if (params.isSyncing) return false;
  return params.queue.dirty || params.queue.pendingChangesCount > 0;
}
