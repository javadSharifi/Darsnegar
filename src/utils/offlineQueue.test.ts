import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_OFFLINE_QUEUE,
  enqueueOfflineChange,
  normalizeOfflineQueue,
  shouldFlushOfflineQueue,
} from './offlineQueue';

test('enqueueOfflineChange marks queue dirty and tracks unique lesson IDs', () => {
  let q = enqueueOfflineChange(EMPTY_OFFLINE_QUEUE, { lessonId: 'l-1', timestamp: 1000 });
  q = enqueueOfflineChange(q, { lessonId: 'l-1', timestamp: 2000 });
  q = enqueueOfflineChange(q, { lessonId: 'l-2', timestamp: 3000 });

  assert.equal(q.dirty, true);
  assert.deepEqual(q.pendingLessonIds, ['l-1', 'l-2']);
  assert.equal(q.pendingChangesCount, 3);
  assert.equal(q.lastModifiedAt, 3000);
});

test('enqueueOfflineChange moves lesson from pendingLessonIds to pendingDeletedIds on delete', () => {
  let q = enqueueOfflineChange(EMPTY_OFFLINE_QUEUE, { lessonId: 'l-1', timestamp: 1000 });
  q = enqueueOfflineChange(q, { deletedLessonId: 'l-1', timestamp: 2000 });

  assert.deepEqual(q.pendingLessonIds, []);
  assert.deepEqual(q.pendingDeletedIds, ['l-1']);
  assert.equal(q.dirty, true);
});

test('shouldFlushOfflineQueue returns true only when online, authenticated, not syncing, and dirty', () => {
  const dirtyQueue = enqueueOfflineChange(EMPTY_OFFLINE_QUEUE, { lessonId: 'l-1' });

  assert.equal(
    shouldFlushOfflineQueue({
      isOnline: false,
      hasAuthToken: true,
      queue: dirtyQueue,
      isSyncing: false,
    }),
    false
  );

  assert.equal(
    shouldFlushOfflineQueue({
      isOnline: true,
      hasAuthToken: false,
      queue: dirtyQueue,
      isSyncing: false,
    }),
    false
  );

  assert.equal(
    shouldFlushOfflineQueue({
      isOnline: true,
      hasAuthToken: true,
      queue: EMPTY_OFFLINE_QUEUE,
      isSyncing: false,
    }),
    false
  );

  assert.equal(
    shouldFlushOfflineQueue({
      isOnline: true,
      hasAuthToken: true,
      queue: dirtyQueue,
      isSyncing: true,
    }),
    false
  );

  assert.equal(
    shouldFlushOfflineQueue({
      isOnline: true,
      hasAuthToken: true,
      queue: dirtyQueue,
      isSyncing: false,
    }),
    true
  );
});

test('normalizeOfflineQueue safely handles malformed values', () => {
  assert.deepEqual(normalizeOfflineQueue(null), EMPTY_OFFLINE_QUEUE);
  assert.deepEqual(normalizeOfflineQueue('bad'), EMPTY_OFFLINE_QUEUE);
});
