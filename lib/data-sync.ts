import type { DailyProgress, Gig, Idea, Joke, JokeRating, Recording, Setlist } from '../context/DataContext';
import {
  deleteCloudRecording,
  updateCloudRecordingMetadata,
  uploadRecording,
} from './recording-storage';
import { pushCloudEntity } from './cloud-data';
import type { FlushQueueResult, SyncQueue } from './sync-queue-core';
import { flushSyncQueue } from './sync-queue-core';
import type { SyncEntityType, SyncOperation } from './sync-types';
import { pushPerformanceEntity } from './performance-session-repository';

export { enqueuePendingRecords } from './sync-pending';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function handleRecording(operation: SyncOperation): Promise<void> {
  const recording = operation.payload as Recording;
  if (operation.operation === 'delete' || recording.deletedAt) {
    await deleteCloudRecording(operation.entityId, recording.cloudPath);
    return;
  }

  if (recording.uri) {
    try {
      await uploadRecording(recording);
      return;
    } catch (error) {
      // A metadata edit can still be backed up even if the local audio file was
      // cleaned up by the OS, as long as the cloud object is already present.
      if (!recording.cloudPath) throw error;
    }
  }
  if (recording.cloudPath) {
    await updateCloudRecordingMetadata(recording);
    return;
  }
  throw new Error('Recording has no local or cloud audio copy.');
}

export function createSyncHandlers(userId: string): Partial<Record<SyncEntityType, (operation: SyncOperation) => Promise<void>>> {
  const push = (entityType: Exclude<SyncEntityType, 'recording' | 'performanceSession' | 'sessionEvent' | 'sessionReview'>) => async (operation: SyncOperation) => {
    await pushCloudEntity(userId, entityType, asRecord(operation.payload), operation.operation);
  };

  return {
    idea: push('idea'),
    joke: push('joke'),
    setlist: push('setlist'),
    gig: push('gig'),
    rating: push('rating'),
    progress: push('progress'),
    settings: push('settings'),
    recording: handleRecording,
    performanceSession: async operation => pushPerformanceEntity(userId, 'performanceSession', asRecord(operation.payload), operation.operation),
    sessionEvent: async operation => pushPerformanceEntity(userId, 'sessionEvent', asRecord(operation.payload), operation.operation),
    sessionReview: async operation => pushPerformanceEntity(userId, 'sessionReview', asRecord(operation.payload), operation.operation),
  };
}

export async function flushUserQueue(
  queue: SyncQueue,
  userId: string,
  isActive: () => boolean,
  options: { ignoreBackoff?: boolean } = {},
): Promise<FlushQueueResult> {
  return flushSyncQueue(queue, createSyncHandlers(userId), {
    isActive,
    maxOperations: 100,
    ignoreBackoff: options.ignoreBackoff,
  });
}

export function friendlySyncError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('offline') ||
    message.includes('timeout') ||
    message.includes('failed to fetch')
  ) {
    return "You're offline. Changes are safe on this device and will sync when the connection returns.";
  }
  if (message.includes('not configured')) {
    return 'Cloud sync is not configured on this device. Your work is safe locally.';
  }
  return "Cloud sync couldn't finish. Your changes are safe on this device — retry when you're ready.";
}
