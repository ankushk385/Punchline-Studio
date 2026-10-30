import AsyncStorage from '@react-native-async-storage/async-storage';

import { SyncQueue, type KeyValueStorage } from './sync-queue-core';

const asyncStorageAdapter: KeyValueStorage = {
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: key => AsyncStorage.removeItem(key),
};

const queues = new Map<string, SyncQueue>();

/** One queue instance per signed-in user id. */
export function getSyncQueue(userId: string): SyncQueue {
  const existing = queues.get(userId);
  if (existing) return existing;
  const queue = new SyncQueue(asyncStorageAdapter, userId);
  queues.set(userId, queue);
  return queue;
}

export async function clearSyncQueue(userId: string): Promise<void> {
  await getSyncQueue(userId).clear();
}
