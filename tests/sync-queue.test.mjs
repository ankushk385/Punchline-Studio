import assert from 'node:assert/strict';
import test from 'node:test';

import queueModule from '../lib/sync-queue-core.ts';
import pendingModule from '../lib/sync-pending.ts';

const {
  MAX_RETRY_ATTEMPTS,
  SyncQueue,
  flushSyncQueue,
  retryDelayMs,
  syncQueueStorageKey,
} = queueModule;
const { enqueuePendingRecords } = pendingModule;

const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const EARLIER = '2026-10-29T11:00:00.000Z';
const LATER = '2026-10-29T13:00:00.000Z';

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  async getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async setItem(key, value) {
    this.values.set(key, value);
  }

  async removeItem(key) {
    this.values.delete(key);
  }
}

function operation(overrides = {}) {
  return {
    id: 'op-1',
    userId: 'user-a',
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1', title: 'Test' },
    mutatedAt: EARLIER,
    retryCount: 0,
    ...overrides,
  };
}

function emptySnapshot(overrides = {}) {
  return {
    ideas: [],
    jokes: [],
    setlists: [],
    gigs: [],
    ratings: [],
    progress: [],
    recordings: [],
    settings: null,
    ...overrides,
  };
}

test('queued mutations survive a restart and are scoped by user id', async () => {
  const storage = new MemoryStorage();
  const queueA = new SyncQueue(storage, 'user-a');
  await queueA.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1' },
    mutatedAt: EARLIER,
  });

  const restartedQueue = new SyncQueue(storage, 'user-a');
  const restored = await restartedQueue.list();
  assert.equal(restored.length, 1);
  assert.equal(restored[0].userId, 'user-a');
  assert.equal(restored[0].entityId, 'idea-1');

  const queueB = new SyncQueue(storage, 'user-b');
  assert.deepEqual(await queueB.list(), []);
  assert.notEqual(syncQueueStorageKey('user-a'), syncQueueStorageKey('user-b'));
});

test('signing into another account cannot flush or see the previous queue', async () => {
  const storage = new MemoryStorage();
  const queueA = new SyncQueue(storage, 'user-a');
  await queueA.enqueue({
    entityType: 'idea',
    entityId: 'idea-a',
    operation: 'upsert',
    payload: { id: 'idea-a' },
    mutatedAt: EARLIER,
  });

  let handled = 0;
  const result = await flushSyncQueue(new SyncQueue(storage, 'user-b'), {
    idea: async () => { handled++; },
  });

  assert.equal(result.processed, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.pending, 0);
  assert.equal(handled, 0);
  assert.equal(await queueA.count(), 1);
});

test('queue compaction keeps only the newest operation per entity', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1', title: 'First' },
    mutatedAt: EARLIER,
  });
  await queue.enqueue({
    entityType: 'setlist',
    entityId: 'setlist-1',
    operation: 'upsert',
    payload: { id: 'setlist-1' },
    mutatedAt: EARLIER,
  });
  const newest = await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'delete',
    payload: { id: 'idea-1', deletedAt: LATER },
    mutatedAt: LATER,
  });

  const operations = await queue.list();
  assert.equal(operations.length, 2);
  const compacted = operations.find(item => item.entityType === 'idea');
  assert.equal(compacted.id, newest.id);
  assert.equal(compacted.operation, 'delete');
  assert.equal(compacted.mutatedAt, LATER);
});

test('an older merged snapshot cannot replace a newer queued local intent', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  const newest = await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1', title: 'Newest' },
    mutatedAt: LATER,
  });

  const attempted = await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'delete',
    payload: { id: 'idea-1', deletedAt: EARLIER },
    mutatedAt: EARLIER,
  });

  assert.equal(attempted.id, newest.id);
  const operations = await queue.list();
  assert.equal(operations.length, 1);
  assert.equal(operations[0].id, newest.id);
  assert.equal(operations[0].payload.title, 'Newest');
});

test('successful operations are removed and flushing twice is idempotent', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1' },
    mutatedAt: EARLIER,
  });

  let handled = 0;
  const handlers = { idea: async () => { handled++; } };
  const first = await flushSyncQueue(queue, handlers);
  const second = await flushSyncQueue(queue, handlers);

  assert.equal(first.processed, 1);
  assert.equal(first.pending, 0);
  assert.equal(second.processed, 0);
  assert.equal(second.pending, 0);
  assert.equal(handled, 1);
});

test('failed operations remain queued with bounded exponential backoff', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  const queued = await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1' },
    mutatedAt: EARLIER,
  });

  const result = await flushSyncQueue(queue, {
    idea: async () => { throw new Error('Network request failed'); },
  }, { now: NOW });

  assert.equal(result.processed, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.pending, 1);
  assert.match(result.error, /Network request failed/);

  const stored = await queue.get(queued.id);
  assert.equal(stored.retryCount, 1);
  assert.match(stored.lastError, /Network request failed/);
  assert.equal(Date.parse(stored.nextAttemptAt), NOW + retryDelayMs(1));
});

test('saved backoff is honored unless the retry is forced', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  const queued = await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1' },
    mutatedAt: EARLIER,
  });
  await queue.update(queued.id, {
    retryCount: 2,
    lastError: 'offline',
    nextAttemptAt: new Date(NOW + 60_000).toISOString(),
  });

  let handled = 0;
  const skipped = await flushSyncQueue(queue, {
    idea: async () => { handled++; },
  }, { now: NOW });
  assert.equal(skipped.processed, 0);
  assert.equal(skipped.pending, 1);
  assert.equal(handled, 0);

  const forced = await flushSyncQueue(queue, {
    idea: async () => { handled++; },
  }, { now: NOW, ignoreBackoff: true });
  assert.equal(forced.processed, 1);
  assert.equal(forced.pending, 0);
  assert.equal(handled, 1);
});

test('retries stop after the attempt cap instead of looping forever', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  const queued = await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1' },
    mutatedAt: EARLIER,
  });
  await queue.update(queued.id, { retryCount: MAX_RETRY_ATTEMPTS });

  let handled = 0;
  const result = await flushSyncQueue(queue, {
    idea: async () => { handled++; },
  }, { now: NOW });

  assert.equal(result.failed, 1);
  assert.equal(result.pending, 1);
  assert.match(result.error, /paused after repeated errors/i);
  assert.equal(handled, 0);
});

test('resetRetries clears backoff and lets a manual retry run immediately', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  const queued = await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1' },
    mutatedAt: EARLIER,
  });
  await queue.update(queued.id, {
    retryCount: 5,
    lastError: 'offline',
    nextAttemptAt: new Date(NOW + 60_000).toISOString(),
  });

  await queue.resetRetries();
  const reset = await queue.get(queued.id);
  assert.equal(reset.retryCount, 0);
  assert.equal(reset.lastError, undefined);
  assert.equal(reset.nextAttemptAt, undefined);

  let handled = 0;
  const result = await flushSyncQueue(queue, {
    idea: async () => { handled++; },
  }, { now: NOW });
  assert.equal(result.processed, 1);
  assert.equal(handled, 1);
});

test('removeEntity only removes the exact queued mutation that was handled', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  await queue.enqueue({
    entityType: 'recording',
    entityId: 'recording-1',
    operation: 'upsert',
    payload: { id: 'recording-1' },
    mutatedAt: LATER,
  });

  await queue.removeEntity('recording', 'recording-1', EARLIER);
  assert.equal(await queue.count(), 1);

  await queue.removeEntity('recording', 'recording-1', LATER);
  assert.equal(await queue.count(), 0);
});

test('inactive flushes stop before processing and missing handlers keep work queued', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1' },
    mutatedAt: EARLIER,
  });

  let handled = 0;
  const inactive = await flushSyncQueue(queue, {
    idea: async () => { handled++; },
  }, { isActive: () => false });
  assert.equal(inactive.processed, 0);
  assert.equal(inactive.pending, 1);
  assert.equal(handled, 0);

  const missingHandler = await flushSyncQueue(queue, {}, { now: NOW });
  assert.equal(missingHandler.failed, 1);
  assert.equal(missingHandler.pending, 1);
  assert.match(missingHandler.error, /No sync handler/);
});

test('flush is bounded by maxOperations', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  for (const id of ['idea-1', 'idea-2', 'idea-3']) {
    await queue.enqueue({
      entityType: 'idea',
      entityId: id,
      operation: 'upsert',
      payload: { id },
      mutatedAt: EARLIER,
    });
  }

  let handled = 0;
  const result = await flushSyncQueue(queue, {
    idea: async () => { handled++; },
  }, { maxOperations: 2 });
  assert.equal(result.processed, 2);
  assert.equal(result.pending, 1);
  assert.equal(handled, 2);
});

test('corrupt entries and foreign-user records are ignored', async () => {
  const storage = new MemoryStorage();
  const key = syncQueueStorageKey('user-a');
  await storage.setItem(key, JSON.stringify([
    operation({ id: 'op-valid', userId: 'user-a' }),
    operation({ id: 'op-foreign', userId: 'user-b' }),
    { nope: true },
    null,
  ]));

  const queue = new SyncQueue(storage, 'user-a');
  const operations = await queue.list();
  assert.deepEqual(operations.map(item => item.id), ['op-valid']);

  await storage.setItem(key, '{not json');
  assert.deepEqual(await queue.list(), []);
});

test('clear removes only the current account queue', async () => {
  const storage = new MemoryStorage();
  const queueA = new SyncQueue(storage, 'user-a');
  const queueB = new SyncQueue(storage, 'user-b');
  await queueA.enqueue({
    entityType: 'idea', entityId: 'idea-a', operation: 'upsert', payload: {}, mutatedAt: EARLIER,
  });
  await queueB.enqueue({
    entityType: 'idea', entityId: 'idea-b', operation: 'upsert', payload: {}, mutatedAt: EARLIER,
  });

  await queueA.clear();
  assert.equal(await queueA.count(), 0);
  assert.equal(await queueB.count(), 1);
});

test('retry delays grow exponentially and stop at the five-minute cap', () => {
  assert.equal(retryDelayMs(0), 2000);
  assert.equal(retryDelayMs(1), 4000);
  assert.equal(retryDelayMs(2), 8000);
  assert.equal(retryDelayMs(20), 5 * 60 * 1000);
});

test('re-enqueuing an identical pending snapshot preserves retry state', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  const record = { id: 'idea-1', title: 'Same', createdAt: EARLIER, updatedAt: LATER };
  const queued = await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: record,
    mutatedAt: LATER,
  });
  const nextAttemptAt = new Date(NOW + 60_000).toISOString();
  await queue.update(queued.id, { retryCount: 4, lastError: 'offline', nextAttemptAt });

  await enqueuePendingRecords(queue, emptySnapshot({ ideas: [record] }), [
    { entityType: 'idea', entityId: 'idea-1' },
  ]);

  const operations = await queue.list();
  assert.equal(operations.length, 1);
  assert.equal(operations[0].id, queued.id);
  assert.equal(operations[0].retryCount, 4);
  assert.equal(operations[0].lastError, 'offline');
  assert.equal(operations[0].nextAttemptAt, nextAttemptAt);
});

test('a changed payload at the same timestamp is queued as a new intent', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  await queue.enqueue({
    entityType: 'idea',
    entityId: 'idea-1',
    operation: 'upsert',
    payload: { id: 'idea-1', title: 'Old' },
    mutatedAt: LATER,
  });

  const record = { id: 'idea-1', title: 'New', createdAt: EARLIER, updatedAt: LATER };
  await enqueuePendingRecords(queue, emptySnapshot({ ideas: [record] }), [
    { entityType: 'idea', entityId: 'idea-1' },
  ]);

  const operations = await queue.list();
  assert.equal(operations.length, 1);
  assert.equal(operations[0].payload.title, 'New');
  assert.equal(operations[0].retryCount, 0);
});

test('pending deletions use the tombstone timestamp and ignore missing records', async () => {
  const queue = new SyncQueue(new MemoryStorage(), 'user-a');
  const tombstone = {
    id: 'idea-1',
    createdAt: EARLIER,
    updatedAt: LATER,
    deletedAt: LATER,
  };
  await enqueuePendingRecords(queue, emptySnapshot({ ideas: [tombstone] }), [
    { entityType: 'idea', entityId: 'idea-1' },
    { entityType: 'idea', entityId: 'missing' },
  ]);

  const operations = await queue.list();
  assert.equal(operations.length, 1);
  assert.equal(operations[0].operation, 'delete');
  assert.equal(operations[0].mutatedAt, LATER);
});
