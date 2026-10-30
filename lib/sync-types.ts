import type {
  CrowdType,
  DailyProgress,
  Gig,
  Idea,
  Joke,
  JokeRating,
  Recording,
  Setlist,
  ComedyStyle,
} from '../context/DataContext';

/**
 * Account settings that are intended to follow the user between devices.
 * Appearance, haptics, sounds, permissions, and calendar identifiers stay
 * device-local on purpose.
 */
export interface SyncedUserSettings {
  displayName: string;
  comedyStyle: ComedyStyle;
  crowdType: CrowdType;
  dailyWriteTarget: number;
  dailyPracticeMinutes: number;
  activeSetlistId: string | null;
  updatedAt: string;
}

export interface SyncSnapshot {
  ideas: Idea[];
  jokes: Joke[];
  setlists: Setlist[];
  gigs: Gig[];
  ratings: JokeRating[];
  progress: DailyProgress[];
  recordings: Recording[];
  settings: SyncedUserSettings | null;
}

export type SyncEntityType =
  | 'idea'
  | 'joke'
  | 'setlist'
  | 'gig'
  | 'rating'
  | 'progress'
  | 'settings'
  | 'recording';

export type QueueOperationType = 'upsert' | 'delete';

export interface SyncOperation<T = unknown> {
  id: string;
  userId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: QueueOperationType;
  payload: T;
  /** Client modification timestamp used for last-write-wins comparisons. */
  mutatedAt: string;
  retryCount: number;
  lastError?: string;
  nextAttemptAt?: string;
}
