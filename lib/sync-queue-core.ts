import type { SyncEntityType, SyncOperation, QueueOperationType } from './sync-types';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const QUEUE_PREFIX = '@standup:syncQueue:';
const MAX_QUEUED_OPERATIONS = 1000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
export const MAX_RETRY_ATTEMPTS = 8;

export function syncQueueStorageKey(userId: string): string {
  return `${QUEUE_PREFIX}${userId}`;
}

export function createOperationId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sortOperations(operations: SyncOperation[]): SyncOperation[] {
  return [...operations].sort((a, b) => a.mutatedAt.localeCompare(b.mutatedAt) || a.id.localeCompare(b.id));
}

/**
 * Per-user persistent mutation queue.
 *
 * Each entity keeps only its newest operation. That collapse is safe because
 * every cloud write is an upsert keyed by the stable record id, and a later
 * operation always supersedes the earlier local intent. Different entities and
 * different users remain in separate keys, so switching accounts can never
 * flush another account's work.
 */
export class SyncQueue {
  private readonly storage: KeyValueStorage;
  private readonly userId: string;
  private readonly key: string;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(storage: KeyValueStorage, userId: string) {
    this.storage = storage;
    this.userId = userId;
    this.key = syncQueueStorageKey(userId);
  }

  private runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work, work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async read(): Promise<SyncOperation[]> {
    const raw = await this.storage.getItem(this.key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is SyncOperation =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as SyncOperation).id === 'string' &&
        typeof (item as SyncOperation).entityType === 'string' &&
        typeof (item as SyncOperation).entityId === 'string' &&
        typeof (item as SyncOperation).userId === 'string' &&
        (item as SyncOperation).userId === this.userId,
      );
    } catch {
      return [];
    }
  }

  private async write(operations: SyncOperation[]): Promise<void> {
    const bounded = operations.length > MAX_QUEUED_OPERATIONS
      ? operations.slice(operations.length - MAX_QUEUED_OPERATIONS)
      : operations;
    await this.storage.setItem(this.key, JSON.stringify(bounded));
  }

  list(): Promise<SyncOperation[]> {
    return this.runExclusive(async () => sortOperations(await this.read()));
  }

  get(id: string): Promise<SyncOperation | undefined> {
    return this.runExclusive(async () => (await this.read()).find(operation => operation.id === id));
  }

  getEntity(entityType: SyncEntityType, entityId: string): Promise<SyncOperation | undefined> {
    return this.runExclusive(async () => (await this.read()).find(operation =>
      operation.entityType === entityType && operation.entityId === entityId,
    ));
  }

  count(): Promise<number> {
    return this.runExclusive(async () => (await this.read()).length);
  }

  enqueue(input: {
    entityType: SyncEntityType;
    entityId: string;
    operation: QueueOperationType;
    payload: unknown;
    mutatedAt: string;
  }): Promise<SyncOperation> {
    return this.runExclusive(async () => {
      const operations = await this.read();
      const operation: SyncOperation = {
        id: createOperationId(),
        userId: this.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        operation: input.operation,
        payload: input.payload,
        mutatedAt: input.mutatedAt,
        retryCount: 0,
      };
      const existing = operations.find(item =>
        item.entityType === input.entityType && item.entityId === input.entityId);
      // Never let an older merged snapshot replace a newer local intent.
      if (existing && existing.mutatedAt > input.mutatedAt) return existing;

      const next = operations.filter(item =>
        !(item.entityType === input.entityType && item.entityId === input.entityId),
      );
      next.push(operation);
      await this.write(next);
      return operation;
    });
  }

  remove(id: string): Promise<void> {
    return this.runExclusive(async () => {
      const operations = await this.read();
      const next = operations.filter(operation => operation.id !== id);
      if (next.length !== operations.length) await this.write(next);
    });
  }

  /**
   * Removes the newest queued operation for an entity. Pass mutatedAt to only
   * remove the operation that a direct upload already handled, leaving a newer
   * edit or deletion queued.
   */
  removeEntity(entityType: SyncEntityType, entityId: string, mutatedAt?: string): Promise<void> {
    return this.runExclusive(async () => {
      const operations = await this.read();
      const next = operations.filter(operation => {
        const sameEntity = operation.entityType === entityType && operation.entityId === entityId;
        if (!sameEntity) return true;
        return mutatedAt !== undefined && operation.mutatedAt !== mutatedAt;
      });
      if (next.length !== operations.length) await this.write(next);
    });
  }

  /** Clears retry backoff so an explicit user retry can run immediately. */
  resetRetries(): Promise<void> {
    return this.runExclusive(async () => {
      const operations = await this.read();
      const next = operations.map(({ nextAttemptAt: _nextAttemptAt, lastError: _lastError, ...operation }) => ({
        ...operation,
        retryCount: 0,
      }));
      if (next.length) await this.write(next);
    });
  }

  update(id: string, changes: Partial<Pick<SyncOperation, 'retryCount' | 'lastError' | 'nextAttemptAt'>>): Promise<void> {
    return this.runExclusive(async () => {
      const operations = await this.read();
      let changed = false;
      const next = operations.map(operation => {
        if (operation.id !== id) return operation;
        changed = true;
        return { ...operation, ...changes };
      });
      if (changed) await this.write(next);
    });
  }

  clear(): Promise<void> {
    return this.runExclusive(async () => {
      await this.storage.removeItem(this.key);
    });
  }
}

export function retryDelayMs(retryCount: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, 2000 * 2 ** Math.max(0, retryCount));
}

export interface FlushQueueResult {
  processed: number;
  failed: number;
  pending: number;
  error?: string;
}

export type SyncOperationHandler = (operation: SyncOperation) => Promise<void>;

/**
 * Flush a queue once. A successful operation is removed immediately. A failed
 * operation stays queued with a bounded exponential backoff. The flush never
 * loops forever and stops before touching another account's queue.
 */
export async function flushSyncQueue(
  queue: SyncQueue,
  handlers: Partial<Record<SyncEntityType, SyncOperationHandler>>,
  options: {
    isActive?: () => boolean;
    maxOperations?: number;
    now?: number;
    /** Manual retries should ignore the saved exponential backoff. */
    ignoreBackoff?: boolean;
  } = {},
): Promise<FlushQueueResult> {
  const isActive = options.isActive ?? (() => true);
  const now = options.now ?? Date.now();
  const maxOperations = options.maxOperations ?? 100;
  const ignoreBackoff = options.ignoreBackoff ?? false;
  const snapshot = await queue.list();
  let processed = 0;
  let failed = 0;
  let error: string | undefined;

  for (const queued of snapshot) {
    if (processed + failed >= maxOperations) break;
    if (!isActive()) break;

    const operation = await queue.get(queued.id);
    if (!operation) continue;

    if (!ignoreBackoff && operation.nextAttemptAt && Date.parse(operation.nextAttemptAt) > now) continue;

    if (operation.retryCount >= MAX_RETRY_ATTEMPTS && !ignoreBackoff) {
      failed++;
      error = 'Sync is paused after repeated errors. Retry when you have a connection.';
      break;
    }

    const handler = handlers[operation.entityType];
    if (!handler) {
      const retryCount = operation.retryCount + 1;
      await queue.update(operation.id, {
        retryCount,
        lastError: `No sync handler for ${operation.entityType}.`,
        nextAttemptAt: new Date(now + retryDelayMs(retryCount)).toISOString(),
      });
      failed++;
      error = `No sync handler for ${operation.entityType}.`;
      break;
    }

    try {
      await handler(operation);
      await queue.remove(operation.id);
      processed++;
    } catch (caught) {
      const retryCount = operation.retryCount + 1;
      const message = caught instanceof Error ? caught.message : 'Unknown synchronization error.';
      await queue.update(operation.id, {
        retryCount,
        lastError: message,
        nextAttemptAt: new Date(now + retryDelayMs(retryCount)).toISOString(),
      });
      failed++;
      error = message;
      // Stop on the first failure: usually this means connectivity is down and
      // hammering every remaining operation would only extend an outage.
      break;
    }
  }

  return { processed, failed, pending: await queue.count(), error };
}
