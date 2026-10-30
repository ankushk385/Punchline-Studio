import type { PendingEntity } from './sync-merge';
import { stableSerialize } from './sync-merge';
import type { SyncQueue } from './sync-queue-core';
import type { SyncSnapshot } from './sync-types';

function asRecordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function findRecord(snapshot: SyncSnapshot, pending: PendingEntity): Record<string, unknown> | null {
  switch (pending.entityType) {
    case 'idea': return asRecordValue(snapshot.ideas.find(item => item.id === pending.entityId));
    case 'joke': return asRecordValue(snapshot.jokes.find(item => item.id === pending.entityId));
    case 'setlist': return asRecordValue(snapshot.setlists.find(item => item.id === pending.entityId));
    case 'gig': return asRecordValue(snapshot.gigs.find(item => item.id === pending.entityId));
    case 'rating': return asRecordValue(snapshot.ratings.find(item => item.id === pending.entityId));
    case 'progress': return asRecordValue(snapshot.progress.find(item => item.id === pending.entityId));
    case 'recording': return asRecordValue(snapshot.recordings.find(item => item.id === pending.entityId));
    case 'settings': return snapshot.settings ? { ...snapshot.settings } as unknown as Record<string, unknown> : null;
    default: return null;
  }
}

/**
 * Queue every merged record that is newer than its cloud copy.
 *
 * Re-enqueuing the same intent (same operation and modification timestamp) must
 * not reset the retry/backoff state, otherwise a periodic merge would keep a
 * broken operation at retry zero forever.
 */
export async function enqueuePendingRecords(
  queue: SyncQueue,
  snapshot: SyncSnapshot,
  pending: PendingEntity[],
): Promise<void> {
  for (const item of pending) {
    const record = findRecord(snapshot, item);
    if (!record) continue;
    const deletedAt = typeof record.deletedAt === 'string' ? record.deletedAt : undefined;
    const mutatedAt = (typeof record.updatedAt === 'string' ? record.updatedAt : undefined)
      ?? (typeof record.createdAt === 'string' ? record.createdAt : undefined)
      ?? new Date().toISOString();
    const operation = deletedAt ? 'delete' : 'upsert';
    const existing = await queue.getEntity(item.entityType, item.entityId);
    const sameIntent = existing
      && existing.operation === operation
      && existing.mutatedAt === (deletedAt ?? mutatedAt)
      && stableSerialize(existing.payload) === stableSerialize(record);
    if (sameIntent) continue;
    await queue.enqueue({
      entityType: item.entityType,
      entityId: item.entityId,
      operation,
      payload: record,
      mutatedAt: deletedAt ?? mutatedAt,
    });
  }
}
