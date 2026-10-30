import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { getLocalDateString } from '@/lib/date';
import { authRedirectTo, createSessionFromUrl, signInWithGoogle as beginGoogleSignIn } from '@/lib/auth';
import { isSupabaseConfigured, requireSupabaseConfiguration, supabase } from '@/lib/supabase';
import {
  getSignedRecordingUrl,
  uploadRecording as uploadRecordingToCloud,
} from '@/lib/recording-storage';
import { deleteGigEvent, syncGigEvent } from '@/lib/gig-calendar';
import { deleteAllCloudData, fetchCloudSnapshot, progressRecordId } from '@/lib/cloud-data';
import { enqueuePendingRecords, flushUserQueue, friendlySyncError } from '@/lib/data-sync';
import { clearSyncQueue, getSyncQueue } from '@/lib/sync-queue';
import { mergeSnapshots } from '@/lib/sync-merge';
import type { SyncEntityType, SyncSnapshot, SyncedUserSettings } from '@/lib/sync-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IdeaStatus = 'raw' | 'developing' | 'stage-ready' | 'archived';
export type ComedyStyle = 'observational' | 'dark' | 'storytelling' | 'roast' | 'self-deprecating' | 'absurdist';
export type CrowdType = 'corporate' | 'college' | 'club' | 'any';
export type JokeState = 'draft' | 'developing' | 'stage-ready' | 'retired' | 'in-set';

export interface Idea {
  id: string;
  title: string;
  body: string;
  status: IdeaStatus;
  tags: string[];
  comedyStyle?: ComedyStyle;
  voiceClip?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface JokeVersion {
  id: string;
  version: number;
  setup: string;
  punchline: string;
  tag: string;
  callback: string;
  createdAt: string;
  note: string;
}

export interface Joke {
  id: string;
  title: string;
  setup: string;
  punchline: string;
  tag: string;
  callback: string;
  tags: string[];
  duration: number;
  jokeState: JokeState;
  comedyStyle?: ComedyStyle;
  crowdType?: CrowdType;
  ideaId?: string;
  versions: JokeVersion[];
  avgScore?: number;
  performanceCount?: number;
  lastPerformedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SetlistJoke {
  jokeId: string;
  duration: number;
}

export interface Setlist {
  id: string;
  name: string;
  jokes: SetlistJoke[];
  crowdType: CrowdType;
  isActive: boolean;
  lastPerformedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Recording {
  id: string;
  name: string;
  uri: string;
  duration: number;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  jokeId?: string;
  ideaId?: string;
  setlistId?: string;
  kind?: 'performance' | 'voice-take' | 'idea-note';
  isBestTake?: boolean;
  cloudPath?: string;
  mimeType?: string;
  uploadStatus?: 'local' | 'uploading' | 'synced' | 'failed';
  uploadProgress?: number;
  notes?: string;
  tags?: string[];
}

export interface Gig {
  id: string;
  title: string;
  venue: string;
  startsAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  calendarId?: string;
  calendarEventId?: string;
  calendarSyncedAt?: string;
  deletedAt?: string;
}

export interface JokeRating {
  id: string;
  jokeId: string;
  performanceDate: string;
  rating: number;
  laughScore: number;
  notes: string;
  crowdType: CrowdType;
  kept: boolean;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface Goals {
  dailyWriteTarget: number;
  dailyPracticeMinutes: number;
}

export interface DailyProgress {
  id: string;
  date: string;
  jokesWritten: number;
  practiceMinutes: number;
  updatedAt?: string;
  deletedAt?: string;
}

export type CloudSyncPhase = 'idle' | 'syncing' | 'error' | 'unavailable';

export interface CloudSyncState {
  phase: CloudSyncPhase;
  lastSyncedAt: string | null;
  pendingCount: number;
  message: string | null;
  initialMigrationComplete: boolean;
}

export interface UserProfile {
  displayName: string;
  comedyStyle: ComedyStyle;
  crowdType: CrowdType;
}

// ─── Daily Prompts ─────────────────────────────────────────────────────────────

export const DAILY_PROMPTS = [
  "Your most embarrassing moment as a child",
  "Something you lie about to strangers",
  "The worst advice you ever followed",
  "A time technology completely betrayed you",
  "What your pet definitely thinks about you",
  "The most awkward thing you've witnessed in public",
  "A time your family completely misunderstood you",
  "The most ridiculous thing you've Googled",
  "Why your morning routine is secretly chaos",
  "Something that makes no sense but everyone just accepts",
  "A rule you've invented that nobody else follows",
  "The moment you realised adulthood was a scam",
  "What you'd say if you had no filter for one day",
  "A conspiracy theory you'd believe if it were true",
  "The weirdest thing you do when no one is watching",
  "How your relationship with food has changed",
  "A time you confidently gave wrong directions",
  "Something you're surprisingly bad at for your age",
  "The most passive-aggressive thing you've ever done",
  "Why sleep is now your personality",
  "Something that scared you as a kid that now seems hilarious",
  "A time autocorrect almost ruined your life",
  "What dating apps have actually taught you about humanity",
  "The gap between how you thought your 30s would look and reality",
  "Something only children of your culture will understand",
];

function getTodayPrompt(): string {
  const localMidnight = new Date();
  localMidnight.setHours(0, 0, 0, 0);
  const dayIndex = Math.floor(localMidnight.getTime() / (1000 * 60 * 60 * 24));
  return DAILY_PROMPTS[((dayIndex % DAILY_PROMPTS.length) + DAILY_PROMPTS.length) % DAILY_PROMPTS.length];
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const KEYS = {
  IDEAS: '@standup:ideas',
  JOKES: '@standup:jokes',
  SETLISTS: '@standup:setlists',
  RECORDINGS: '@standup:recordings',
  GIGS: '@standup:gigs',
  RATINGS: '@standup:ratings',
  GOALS: '@standup:goals',
  PROGRESS: '@standup:progress',
  AUTH: '@standup:auth',
  SESSION: '@standup:session',
  ACTIVE_SETLIST: '@standup:activeSetlist',
  PROFILE: '@standup:profile',
  SETTINGS_UPDATED: '@standup:settingsUpdatedAt',
  CLOUD_MIGRATED: '@standup:cloudMigrationComplete',
  LAST_SYNC: '@standup:lastSync',
};

const USER_DATA_KEYS = [
  KEYS.IDEAS, KEYS.JOKES, KEYS.SETLISTS, KEYS.RECORDINGS, KEYS.GIGS,
  KEYS.RATINGS, KEYS.GOALS, KEYS.PROGRESS, KEYS.ACTIVE_SETLIST, KEYS.PROFILE,
  KEYS.SETTINGS_UPDATED, KEYS.CLOUD_MIGRATED, KEYS.LAST_SYNC,
];

// ─── Context Interface ─────────────────────────────────────────────────────────

interface DataContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  userName: string;

  profile: UserProfile;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;

  ideas: Idea[];
  addIdea: (data: Omit<Idea, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Idea>;
  updateIdea: (id: string, data: Partial<Idea>) => Promise<void>;
  deleteIdea: (id: string) => Promise<void>;

  jokes: Joke[];
  addJoke: (data: Omit<Joke, 'id' | 'createdAt' | 'updatedAt' | 'versions'>) => Promise<Joke>;
  updateJoke: (id: string, data: Partial<Joke>) => Promise<void>;
  deleteJoke: (id: string) => Promise<void>;
  saveJokeVersion: (jokeId: string, note?: string) => Promise<void>;
  revertJokeVersion: (jokeId: string, versionId: string) => Promise<void>;

  setlists: Setlist[];
  activeSetlistId: string | null;
  setActiveSetlistId: (id: string | null) => void;
  addSetlist: (name: string, crowdType?: CrowdType) => Promise<Setlist>;
  updateSetlist: (id: string, data: Partial<Setlist>) => Promise<void>;
  deleteSetlist: (id: string) => Promise<void>;
  duplicateSetlist: (id: string) => Promise<void>;
  addJokeToSetlist: (setlistId: string, jokeId: string, duration: number) => Promise<void>;
  removeJokeFromSetlist: (setlistId: string, jokeId: string) => Promise<void>;
  reorderSetlistJokes: (setlistId: string, jokes: SetlistJoke[]) => Promise<void>;

  recordings: Recording[];
  addRecording: (data: Omit<Recording, 'id' | 'createdAt'>) => Promise<Recording>;
  updateRecording: (id: string, data: Partial<Recording>) => Promise<void>;
  uploadRecording: (id: string) => Promise<void>;
  getRecordingPlaybackUri: (recording: Recording) => Promise<string>;
  deleteRecording: (id: string) => Promise<void>;

  gigs: Gig[];
  addGig: (data: Omit<Gig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Gig>;
  updateGig: (id: string, data: Partial<Gig>) => Promise<void>;
  syncGigToCalendar: (id: string) => Promise<void>;
  deleteGig: (id: string) => Promise<void>;

  ratings: JokeRating[];
  addRating: (data: Omit<JokeRating, 'id' | 'createdAt'>) => Promise<JokeRating>;
  addRatings: (data: Omit<JokeRating, 'id' | 'createdAt'>[]) => Promise<JokeRating[]>;
  updateRating: (id: string, data: Partial<JokeRating>) => Promise<void>;
  deleteRating: (id: string) => Promise<void>;
  getJokeAvgScore: (jokeId: string) => number | null;
  isLowPerformer: (jokeId: string) => boolean;

  goals: Goals;
  updateGoals: (data: Partial<Goals>) => Promise<void>;

  progress: DailyProgress[];
  recordPracticeMinutes: (minutes: number) => Promise<void>;
  todayProgress: DailyProgress;
  writingStreak: number;

  todayPrompt: string;

  syncState: CloudSyncState;
  syncNow: () => Promise<void>;
  retrySync: () => Promise<void>;
  deleteCloudAccountData: () => Promise<void>;

  /** Clears only this device's cached copy; cloud data is left intact. */
  resetAllData: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const today = () => getLocalDateString();

function parseStored<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error('Could not parse stored data:', error);
    return fallback;
  }
}

function computeStreak(progress: DailyProgress[]): number {
  if (progress.length === 0) return 0;
  const todayStr = today();
  const byDate = new Map(progress.map(entry => [entry.date, entry]));
  const checkDate = new Date();
  let streak = 0;

  // Guard against a bad clock or malformed entries ever looping forever.
  for (let i = 0; i < 3660; i++) {
    const dateStr = getLocalDateString(checkDate);
    const entry = byDate.get(dateStr);
    if (entry && (entry.jokesWritten > 0 || entry.practiceMinutes > 0)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (dateStr === todayStr) {
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DataProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null | undefined>(undefined);
  const [userName, setUserName] = useState('Comedian');

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [jokes, setJokes] = useState<Joke[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [ratings, setRatings] = useState<JokeRating[]>([]);
  const [goals, setGoals] = useState<Goals>({ dailyWriteTarget: 2, dailyPracticeMinutes: 15 });
  const [progress, setProgress] = useState<DailyProgress[]>([]);
  const [activeSetlistId, setActiveSetlistIdState] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    displayName: 'Comedian',
    comedyStyle: 'observational',
    crowdType: 'any',
  });
  const [syncState, setSyncState] = useState<CloudSyncState>({
    phase: isSupabaseConfigured ? 'idle' : 'unavailable',
    lastSyncedAt: null,
    pendingCount: 0,
    message: isSupabaseConfigured ? null : 'Cloud sync is not configured on this device.',
    initialMigrationComplete: false,
  });

  // Refs mirror state so several writes in the same tick never operate on a
  // stale snapshot (for example, saving ratings for a whole set at once).
  const ideasRef = useRef<Idea[]>([]);
  const jokesRef = useRef<Joke[]>([]);
  const setlistsRef = useRef<Setlist[]>([]);
  const recordingsRef = useRef<Recording[]>([]);
  const gigsRef = useRef<Gig[]>([]);
  const ratingsRef = useRef<JokeRating[]>([]);
  const goalsRef = useRef<Goals>({ dailyWriteTarget: 2, dailyPracticeMinutes: 15 });
  const progressRef = useRef<DailyProgress[]>([]);
  const profileRef = useRef<UserProfile>({
    displayName: 'Comedian',
    comedyStyle: 'observational',
    crowdType: 'any',
  });
  const storageUserIdRef = useRef<string | null>(null);
  const authUserIdRef = useRef<string | null>(null);
  const activeSetlistIdRef = useRef<string | null>(null);
  const settingsUpdatedAtRef = useRef('');
  const mountedRef = useRef(true);
  const syncInFlightRef = useRef<string | null>(null);
  const syncAgainRef = useRef(false);
  const syncGenerationRef = useRef(0);
  const syncFailureCountRef = useRef(0);
  const localMutationVersionRef = useRef(0);
  const cloudMigratedRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSyncRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const scheduleSyncRef = useRef<(delayMs?: number) => void>(() => {});
  const storageKey = useCallback((key: string) => {
    const userId = storageUserIdRef.current;
    return userId ? `${key}:${userId}` : key;
  }, []);

  // ─── Stable setters ────────────────────────────────────────────────────────
  // Raw refs keep tombstones for synchronization, while the public state arrays
  // only contain records the user should see.
  const commitIdeas = useCallback((next: Idea[]) => { localMutationVersionRef.current += 1; ideasRef.current = next; setIdeas(next.filter(item => !item.deletedAt)); }, []);
  const commitJokes = useCallback((next: Joke[]) => { localMutationVersionRef.current += 1; jokesRef.current = next; setJokes(next.filter(item => !item.deletedAt)); }, []);
  const commitSetlists = useCallback((next: Setlist[]) => { localMutationVersionRef.current += 1; setlistsRef.current = next; setSetlists(next.filter(item => !item.deletedAt)); }, []);
  const commitRecordings = useCallback((next: Recording[]) => { localMutationVersionRef.current += 1; recordingsRef.current = next; setRecordings(next.filter(item => !item.deletedAt)); }, []);
  const commitGigs = useCallback((next: Gig[]) => { localMutationVersionRef.current += 1; gigsRef.current = next; setGigs(next.filter(item => !item.deletedAt)); }, []);
  const commitRatings = useCallback((next: JokeRating[]) => { localMutationVersionRef.current += 1; ratingsRef.current = next; setRatings(next.filter(item => !item.deletedAt)); }, []);
  const commitProgress = useCallback((next: DailyProgress[]) => { localMutationVersionRef.current += 1; progressRef.current = next; setProgress(next.filter(item => !item.deletedAt)); }, []);
  const commitGoals = useCallback((next: Goals) => { localMutationVersionRef.current += 1; goalsRef.current = next; setGoals(next); }, []);
  const commitProfile = useCallback((next: UserProfile) => { localMutationVersionRef.current += 1; profileRef.current = next; setProfile(next); }, []);

  // ─── Persistence helpers ───────────────────────────────────────────────────
  const saveIdeas = useCallback(async (data: Idea[]) => {
    await AsyncStorage.setItem(storageKey(KEYS.IDEAS), JSON.stringify(data));
  }, [storageKey]);
  const saveJokes = useCallback(async (data: Joke[]) => {
    await AsyncStorage.setItem(storageKey(KEYS.JOKES), JSON.stringify(data));
  }, [storageKey]);
  const saveSetlists = useCallback(async (data: Setlist[]) => {
    await AsyncStorage.setItem(storageKey(KEYS.SETLISTS), JSON.stringify(data));
  }, [storageKey]);
  const saveRecordings = useCallback(async (data: Recording[]) => {
    await AsyncStorage.setItem(storageKey(KEYS.RECORDINGS), JSON.stringify(data));
  }, [storageKey]);
  const saveGigs = useCallback(async (data: Gig[]) => {
    await AsyncStorage.setItem(storageKey(KEYS.GIGS), JSON.stringify(data));
  }, [storageKey]);
  const saveRatings = useCallback(async (data: JokeRating[]) => {
    await AsyncStorage.setItem(storageKey(KEYS.RATINGS), JSON.stringify(data));
  }, [storageKey]);
  const saveProgress = useCallback(async (data: DailyProgress[]) => {
    await AsyncStorage.setItem(storageKey(KEYS.PROGRESS), JSON.stringify(data));
  }, [storageKey]);

  // ─── Cloud queue ───────────────────────────────────────────────────────────
  const refreshPendingCount = useCallback(async () => {
    const userId = authUserIdRef.current;
    if (!userId || !isSupabaseConfigured) {
      setSyncState(current => ({ ...current, pendingCount: 0 }));
      return;
    }
    try {
      const pendingCount = await getSyncQueue(userId).count();
      if (!mountedRef.current) return;
      setSyncState(current => ({ ...current, pendingCount }));
    } catch (error) {
      console.warn('Could not read the pending sync queue.', error);
    }
  }, []);

  const queueOperation = useCallback((
    entityType: SyncEntityType,
    entityId: string,
    operation: 'upsert' | 'delete',
    payload: unknown,
    mutatedAt: string,
  ) => {
    const userId = authUserIdRef.current;
    if (!userId || !isSupabaseConfigured) return;
    const queue = getSyncQueue(userId);
    queue.enqueue({ entityType, entityId, operation, payload, mutatedAt })
      .then(() => {
        void refreshPendingCount();
        scheduleSyncRef.current(1200);
      })
      .catch(error => console.warn('Could not queue a cloud change; it remains saved locally.', error));
  }, [refreshPendingCount]);

  const buildSettingsSnapshot = useCallback((updatedAt?: string): SyncedUserSettings => ({
    displayName: profileRef.current.displayName,
    comedyStyle: profileRef.current.comedyStyle,
    crowdType: profileRef.current.crowdType,
    dailyWriteTarget: goalsRef.current.dailyWriteTarget,
    dailyPracticeMinutes: goalsRef.current.dailyPracticeMinutes,
    activeSetlistId: activeSetlistIdRef.current,
    updatedAt: updatedAt || settingsUpdatedAtRef.current || new Date(0).toISOString(),
  }), []);

  const queueSettings = useCallback((updatedAt: string) => {
    queueOperation('settings', 'user-settings', 'upsert', buildSettingsSnapshot(updatedAt), updatedAt);
  }, [buildSettingsSnapshot, queueOperation]);

  const touchSettings = useCallback(() => {
    const now = new Date().toISOString();
    settingsUpdatedAtRef.current = now;
    void AsyncStorage.setItem(storageKey(KEYS.SETTINGS_UPDATED), now).catch(error =>
      console.warn('Could not persist the settings timestamp.', error));
    return now;
  }, [storageKey]);

  const setActiveSetlistId = useCallback((id: string | null) => {
    localMutationVersionRef.current += 1;
    setActiveSetlistIdState(id);
    activeSetlistIdRef.current = id;
    const key = storageKey(KEYS.ACTIVE_SETLIST);
    const write = id ? AsyncStorage.setItem(key, id) : AsyncStorage.removeItem(key);
    write.catch(error => console.error('Could not persist active setlist:', error));
    const updatedAt = touchSettings();
    queueSettings(updatedAt);
  }, [queueSettings, storageKey, touchSettings]);

  // Keeps a joke's aggregate score in sync with its ratings.
  const applyRatingStats = useCallback(async (allRatings: JokeRating[], affectedJokeIds: string[]) => {
    const affected = new Set(affectedJokeIds);
    if (affected.size === 0) return;

    const now = new Date().toISOString();
    const updatedJokes = jokesRef.current.map(joke => {
      if (!affected.has(joke.id) || joke.deletedAt) return joke;
      const jokeRatings = allRatings.filter(r => !r.deletedAt && r.jokeId === joke.id);
      if (jokeRatings.length === 0) {
        return {
          ...joke,
          avgScore: undefined,
          performanceCount: 0,
          lastPerformedAt: undefined,
          updatedAt: now,
        };
      }
      const avg = jokeRatings.reduce((sum, r) => sum + r.laughScore, 0) / jokeRatings.length;
      const lastPerformedAt = jokeRatings
        .map(r => r.performanceDate)
        .sort()
        .slice(-1)[0];
      return {
        ...joke,
        avgScore: Math.round(avg * 10) / 10,
        performanceCount: jokeRatings.length,
        lastPerformedAt,
        updatedAt: now,
      };
    });

    commitJokes(updatedJokes);
    await saveJokes(updatedJokes);
    for (const jokeId of affected) {
      const joke = updatedJokes.find(item => item.id === jokeId);
      if (joke && !joke.deletedAt) queueOperation('joke', joke.id, 'upsert', joke, joke.updatedAt);
    }
  }, [commitJokes, queueOperation, saveJokes]);

  // ─── Cloud synchronization ────────────────────────────────────────────────
  const buildLocalSnapshot = useCallback((): SyncSnapshot => ({
    ideas: ideasRef.current,
    jokes: jokesRef.current,
    setlists: setlistsRef.current,
    gigs: gigsRef.current,
    ratings: ratingsRef.current,
    progress: progressRef.current,
    recordings: recordingsRef.current,
    settings: buildSettingsSnapshot(),
  }), [buildSettingsSnapshot]);

  const applySnapshot = useCallback((snapshot: SyncSnapshot) => {
    commitIdeas(snapshot.ideas);
    commitJokes(snapshot.jokes);
    commitSetlists(snapshot.setlists);
    commitGigs(snapshot.gigs);
    commitRatings(snapshot.ratings);
    commitProgress(snapshot.progress);
    commitRecordings(snapshot.recordings);

    if (!snapshot.settings) return;
    commitProfile({
      displayName: snapshot.settings.displayName,
      comedyStyle: snapshot.settings.comedyStyle,
      crowdType: snapshot.settings.crowdType,
    });
    commitGoals({
      dailyWriteTarget: Number(snapshot.settings.dailyWriteTarget) > 0 ? Number(snapshot.settings.dailyWriteTarget) : 2,
      dailyPracticeMinutes: Number(snapshot.settings.dailyPracticeMinutes) > 0 ? Number(snapshot.settings.dailyPracticeMinutes) : 15,
    });
    const requestedActiveId = snapshot.settings.activeSetlistId;
    const activeId = requestedActiveId && snapshot.setlists.some(setlist => setlist.id === requestedActiveId && !setlist.deletedAt)
      ? requestedActiveId
      : null;
    setActiveSetlistIdState(activeId);
    activeSetlistIdRef.current = activeId;
    settingsUpdatedAtRef.current = snapshot.settings.updatedAt;
  }, [commitGigs, commitIdeas, commitJokes, commitProfile, commitProgress, commitRatings, commitRecordings, commitSetlists, commitGoals]);

  const persistSnapshot = useCallback(async (snapshot: SyncSnapshot, userId: string) => {
    const pairs: [string, string][] = [
      [`${KEYS.IDEAS}:${userId}`, JSON.stringify(snapshot.ideas)],
      [`${KEYS.JOKES}:${userId}`, JSON.stringify(snapshot.jokes)],
      [`${KEYS.SETLISTS}:${userId}`, JSON.stringify(snapshot.setlists)],
      [`${KEYS.RECORDINGS}:${userId}`, JSON.stringify(snapshot.recordings)],
      [`${KEYS.GIGS}:${userId}`, JSON.stringify(snapshot.gigs)],
      [`${KEYS.RATINGS}:${userId}`, JSON.stringify(snapshot.ratings)],
      [`${KEYS.PROGRESS}:${userId}`, JSON.stringify(snapshot.progress)],
    ];

    let activeId: string | null = null;
    if (snapshot.settings) {
      const requestedActiveId = snapshot.settings.activeSetlistId;
      activeId = requestedActiveId && snapshot.setlists.some(setlist => setlist.id === requestedActiveId && !setlist.deletedAt)
        ? requestedActiveId
        : null;
      pairs.push(
        [`${KEYS.PROFILE}:${userId}`, JSON.stringify({
          displayName: snapshot.settings.displayName,
          comedyStyle: snapshot.settings.comedyStyle,
          crowdType: snapshot.settings.crowdType,
        })],
        [`${KEYS.GOALS}:${userId}`, JSON.stringify({
          dailyWriteTarget: snapshot.settings.dailyWriteTarget,
          dailyPracticeMinutes: snapshot.settings.dailyPracticeMinutes,
        })],
        [`${KEYS.SETTINGS_UPDATED}:${userId}`, snapshot.settings.updatedAt],
      );
      if (activeId) pairs.push([`${KEYS.ACTIVE_SETLIST}:${userId}`, activeId]);
    }

    await AsyncStorage.multiSet(pairs);
    if (snapshot.settings && !activeId) {
      await AsyncStorage.removeItem(`${KEYS.ACTIVE_SETLIST}:${userId}`);
    }
  }, []);

  const scheduleSync = useCallback((delayMs = 1200) => {
    const userId = authUserIdRef.current;
    if (!userId || !isSupabaseConfigured) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      void runSyncRef.current(false);
    }, Math.max(0, delayMs));
  }, []);

  const clearLocalCacheAndState = useCallback(async (userId: string | null) => {
    const keys = USER_DATA_KEYS.map(key => userId ? `${key}:${userId}` : key);
    await AsyncStorage.multiRemove(keys);
    commitIdeas([]);
    commitJokes([]);
    commitSetlists([]);
    commitRecordings([]);
    commitGigs([]);
    commitRatings([]);
    commitProgress([]);
    commitGoals({ dailyWriteTarget: 2, dailyPracticeMinutes: 15 });
    commitProfile({ displayName: 'Comedian', comedyStyle: 'observational', crowdType: 'any' });
    setActiveSetlistIdState(null);
    activeSetlistIdRef.current = null;
    settingsUpdatedAtRef.current = '';
    cloudMigratedRef.current = false;
  }, [commitGigs, commitIdeas, commitJokes, commitProfile, commitProgress, commitRatings, commitRecordings, commitSetlists, commitGoals]);

  const runSync = useCallback(async (force = false) => {
    const userId = authUserIdRef.current;
    if (!userId || !isSupabaseConfigured || !mountedRef.current) return;

    if (syncInFlightRef.current) {
      // A second mutation arrived while a sync was running; run once more after.
      syncAgainRef.current = true;
      return;
    }

    const generation = syncGenerationRef.current;
    const isActive = () => mountedRef.current
      && authUserIdRef.current === userId
      && syncGenerationRef.current === generation;

    syncInFlightRef.current = userId;
    setSyncState(current => ({ ...current, phase: 'syncing', message: null }));

    try {
      const queue = getSyncQueue(userId);

      // Push queued local changes first so the following cloud read includes them.
      const firstFlush = await flushUserQueue(queue, userId, isActive, { ignoreBackoff: force });
      if (!isActive()) return;

      const cloud = await fetchCloudSnapshot(userId);
      if (!isActive()) return;

      const mutationVersion = localMutationVersionRef.current;
      const local = buildLocalSnapshot();
      const merged = mergeSnapshots(local, cloud.snapshot, {
        recordingTombstones: cloud.recordingTombstones,
      });

      await enqueuePendingRecords(queue, merged.snapshot, merged.pending);
      if (!isActive()) return;

      // A local edit landed while this sync was fetching. Applying the merged
      // snapshot now would overwrite that edit, so reschedule and merge again.
      if (localMutationVersionRef.current !== mutationVersion) {
        syncAgainRef.current = true;
        return;
      }

      applySnapshot(merged.snapshot);
      await persistSnapshot(merged.snapshot, userId);
      if (!isActive()) return;

      // Anything the merge discovered as locally newer is pushed immediately.
      const secondFlush = await flushUserQueue(queue, userId, isActive, { ignoreBackoff: force });
      if (!isActive()) return;

      const pendingCount = await queue.count();
      const now = new Date().toISOString();
      const syncError = firstFlush.error ?? secondFlush.error;
      // Initial migration is only complete once every local record has been
      // merged and the queue is fully drained. A half-finished sync must be
      // retried rather than leave the account marked as migrated.
      const migrationComplete = !syncError && pendingCount === 0;
      if (migrationComplete) cloudMigratedRef.current = true;

      const storedPairs: [string, string][] = [];
      if (!syncError) storedPairs.push([`${KEYS.LAST_SYNC}:${userId}`, now]);
      if (migrationComplete) storedPairs.push([`${KEYS.CLOUD_MIGRATED}:${userId}`, 'true']);
      if (storedPairs.length) await AsyncStorage.multiSet(storedPairs);
      if (!isActive()) return;

      if (syncError) syncFailureCountRef.current += 1;
      else syncFailureCountRef.current = 0;

      setSyncState(current => ({
        phase: syncError ? 'error' : 'idle',
        lastSyncedAt: syncError ? current.lastSyncedAt : now,
        pendingCount,
        message: syncError ? friendlySyncError(new Error(syncError)) : null,
        initialMigrationComplete: cloudMigratedRef.current,
      }));

      // A queued recording upload only gains its cloud path during this flush;
      // one quick follow-up merge refreshes that local status.
      if (secondFlush.processed > 0) syncAgainRef.current = true;
      else if (syncError) {
        const retryDelay = Math.min(5 * 60 * 1000, 2000 * (2 ** Math.min(syncFailureCountRef.current, 8)));
        scheduleSyncRef.current(retryDelay);
      }
    } catch (error) {
      if (isActive()) {
        syncFailureCountRef.current += 1;
        let pendingCount = 0;
        try {
          pendingCount = await getSyncQueue(userId).count();
        } catch {
          pendingCount = 0;
        }
        setSyncState(current => ({
          ...current,
          phase: 'error',
          pendingCount,
          message: friendlySyncError(error),
        }));
        const retryDelay = Math.min(5 * 60 * 1000, 2000 * (2 ** Math.min(syncFailureCountRef.current, 8)));
        scheduleSyncRef.current(retryDelay);
      }
    } finally {
      syncInFlightRef.current = null;
      if (syncAgainRef.current && mountedRef.current) {
        syncAgainRef.current = false;
        scheduleSyncRef.current(1200);
      }
    }
  }, [applySnapshot, buildLocalSnapshot, persistSnapshot]);

  useEffect(() => {
    runSyncRef.current = runSync;
    scheduleSyncRef.current = scheduleSync;
  }, [runSync, scheduleSync]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!authUserId || !isSupabaseConfigured) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') scheduleSyncRef.current(800);
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') scheduleSyncRef.current(2000);
    }, 5 * 60 * 1000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [authUserId]);

  const syncNow = useCallback(async () => {
    const userId = authUserIdRef.current;
    if (!userId) return;
    await getSyncQueue(userId).resetRetries();
    await runSync(true);
  }, [runSync]);

  const retrySync = useCallback(async () => {
    const userId = authUserIdRef.current;
    if (!userId) return;
    await getSyncQueue(userId).resetRetries();
    await runSync(true);
  }, [runSync]);

  const deleteCloudAccountData = useCallback(async () => {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error('Sign in before deleting cloud data.');
    if (syncInFlightRef.current) {
      throw new Error('Wait for the current sync to finish, then try again.');
    }

    syncGenerationRef.current += 1;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    setSyncState(current => ({ ...current, phase: 'syncing', message: null }));

    try {
      await clearSyncQueue(userId);
      await deleteAllCloudData(userId);
      await clearLocalCacheAndState(userId);
      const now = new Date().toISOString();
      cloudMigratedRef.current = true;
      await AsyncStorage.multiSet([
        [`${KEYS.CLOUD_MIGRATED}:${userId}`, 'true'],
        [`${KEYS.LAST_SYNC}:${userId}`, now],
      ]);
      setSyncState({
        phase: isSupabaseConfigured ? 'idle' : 'unavailable',
        lastSyncedAt: now,
        pendingCount: 0,
        message: 'Cloud backup deleted.',
        initialMigrationComplete: true,
      });
    } catch (error) {
      setSyncState(current => ({ ...current, phase: 'error', message: friendlySyncError(error) }));
      throw error;
    }
  }, [clearLocalCacheAndState]);


  useEffect(() => {
    syncGenerationRef.current += 1;
    const generation = syncGenerationRef.current;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    syncAgainRef.current = false;
    syncFailureCountRef.current = 0;

    if (authUserId === undefined) return;

    if (authUserId === null) {
      authUserIdRef.current = null;
      storageUserIdRef.current = null;
      activeSetlistIdRef.current = null;
      settingsUpdatedAtRef.current = '';
      cloudMigratedRef.current = false;
      setActiveSetlistIdState(null);
      commitIdeas([]);
      commitJokes([]);
      commitSetlists([]);
      commitRecordings([]);
      commitGigs([]);
      commitRatings([]);
      commitProgress([]);
      commitGoals({ dailyWriteTarget: 2, dailyPracticeMinutes: 15 });
      commitProfile({ displayName: 'Comedian', comedyStyle: 'observational', crowdType: 'any' });
      setSyncState({
        phase: isSupabaseConfigured ? 'idle' : 'unavailable',
        lastSyncedAt: null,
        pendingCount: 0,
        message: isSupabaseConfigured ? null : 'Cloud sync is not configured on this device.',
        initialMigrationComplete: false,
      });
      setIsLoading(false);
      return;
    }

    let mounted = true;
    authUserIdRef.current = authUserId;
    storageUserIdRef.current = authUserId;
    setIsLoading(true);

    // Never show the previous account's records while this account loads.
    commitIdeas([]);
    commitJokes([]);
    commitSetlists([]);
    commitRecordings([]);
    commitGigs([]);
    commitRatings([]);
    commitProgress([]);
    setActiveSetlistIdState(null);
    activeSetlistIdRef.current = null;

    (async () => {
      try {
        const dataKeys = [
          KEYS.IDEAS, KEYS.JOKES, KEYS.SETLISTS, KEYS.RECORDINGS, KEYS.GIGS,
          KEYS.RATINGS, KEYS.GOALS, KEYS.PROGRESS, KEYS.ACTIVE_SETLIST, KEYS.PROFILE,
        ];
        const metaKeys = [KEYS.SETTINGS_UPDATED, KEYS.CLOUD_MIGRATED, KEYS.LAST_SYNC];
        const scopedDataKeys = dataKeys.map(key => `${key}:${authUserId}`);

        let storedValues = await AsyncStorage.multiGet([
          ...scopedDataKeys,
          ...metaKeys.map(key => `${key}:${authUserId}`),
        ]);
        const hasScopedData = storedValues
          .slice(0, scopedDataKeys.length)
          .some(([, value]) => value !== null);

        // One-time migration of pre-account data. Moving (rather than copying)
        // the legacy keys keeps a second account on this device isolated.
        if (!hasScopedData) {
          const legacyValues = await AsyncStorage.multiGet(dataKeys);
          const legacyPairs = legacyValues
            .map(([, value], index) => [scopedDataKeys[index], value] as [string, string | null])
            .filter((entry): entry is [string, string] => entry[1] !== null);
          if (legacyPairs.length) await AsyncStorage.multiSet(legacyPairs);
          await AsyncStorage.multiRemove(dataKeys);
          storedValues = await AsyncStorage.multiGet([
            ...scopedDataKeys,
            ...metaKeys.map(key => `${key}:${authUserId}`),
          ]);
        }

        if (!mounted || syncGenerationRef.current !== generation) return;
        const values = new Map(storedValues);
        const readValue = (key: string) => values.get(`${key}:${authUserId}`) ?? null;

        const loadedIdeas = parseStored<Idea[]>(readValue(KEYS.IDEAS), []);
        const normalizedIdeas = loadedIdeas
          .filter(i => i && typeof i.id === 'string')
          .map(i => {
            const fallback = i.createdAt || new Date(0).toISOString();
            return {
              ...i,
              tags: Array.isArray(i.tags) ? i.tags : [],
              createdAt: i.createdAt || fallback,
              updatedAt: i.updatedAt || fallback,
            };
          });
        commitIdeas(normalizedIdeas);

        const loadedJokes = parseStored<Joke[]>(readValue(KEYS.JOKES), []);
        const normalizedJokes = loadedJokes
          .filter(j => j && typeof j.id === 'string')
          .map(j => {
            const fallback = j.createdAt || new Date(0).toISOString();
            return {
              ...j,
              jokeState: j.jokeState ?? 'draft',
              crowdType: j.crowdType ?? 'any',
              tags: Array.isArray(j.tags) ? j.tags : [],
              versions: Array.isArray(j.versions) ? j.versions.filter(v => v && typeof v.id === 'string') : [],
              createdAt: j.createdAt || fallback,
              updatedAt: j.updatedAt || fallback,
            };
          });
        commitJokes(normalizedJokes);

        const loadedSetlists = parseStored<Setlist[]>(readValue(KEYS.SETLISTS), []);
        const normalizedSetlists = loadedSetlists
          .filter(s => s && typeof s.id === 'string')
          .map(s => {
            const fallback = s.createdAt || new Date(0).toISOString();
            return {
              ...s,
              crowdType: s.crowdType ?? 'any',
              isActive: s.isActive ?? false,
              jokes: Array.isArray(s.jokes) ? s.jokes.filter(j => j && typeof j.jokeId === 'string') : [],
              createdAt: s.createdAt || fallback,
              updatedAt: s.updatedAt || fallback,
            };
          });
        commitSetlists(normalizedSetlists);

        const loadedRecordings = parseStored<Recording[]>(readValue(KEYS.RECORDINGS), []);
        const normalizedRecordings = loadedRecordings
          .filter(r => r && typeof r.id === 'string' && typeof r.uri === 'string')
          .map(r => {
            const fallback = r.createdAt || new Date(0).toISOString();
            return {
              ...r,
              createdAt: r.createdAt || fallback,
              updatedAt: r.updatedAt || fallback,
              uploadStatus: r.uploadStatus ?? 'local' as const,
            };
          });
        commitRecordings(normalizedRecordings);

        const loadedGigs = parseStored<Gig[]>(readValue(KEYS.GIGS), []);
        const normalizedGigs = loadedGigs
          .filter(g => g && typeof g.id === 'string')
          .map(g => {
            const fallback = g.createdAt || new Date(0).toISOString();
            return { ...g, createdAt: g.createdAt || fallback, updatedAt: g.updatedAt || fallback };
          });
        commitGigs(normalizedGigs);

        const loadedRatings = parseStored<JokeRating[]>(readValue(KEYS.RATINGS), []);
        const normalizedRatings = loadedRatings
          .filter(r => r && typeof r.id === 'string' && typeof r.jokeId === 'string')
          .map(r => {
            const fallback = r.createdAt || new Date(0).toISOString();
            return {
              ...r,
              crowdType: r.crowdType ?? 'any',
              kept: r.kept ?? true,
              createdAt: r.createdAt || fallback,
              updatedAt: r.updatedAt || fallback,
            };
          });
        commitRatings(normalizedRatings);

        const loadedGoals = parseStored<Goals>(readValue(KEYS.GOALS), { dailyWriteTarget: 2, dailyPracticeMinutes: 15 });
        commitGoals({
          dailyWriteTarget: Number(loadedGoals.dailyWriteTarget) > 0 ? Number(loadedGoals.dailyWriteTarget) : 2,
          dailyPracticeMinutes: Number(loadedGoals.dailyPracticeMinutes) > 0 ? Number(loadedGoals.dailyPracticeMinutes) : 15,
        });

        const loadedProgress = parseStored<DailyProgress[]>(readValue(KEYS.PROGRESS), []);
        const progressByDate = new Map<string, DailyProgress>();
        for (const entry of loadedProgress) {
          if (!entry || typeof entry.date !== 'string') continue;
          const id = progressRecordId(authUserId, entry.date);
          progressByDate.set(id, {
            ...entry,
            id,
            jokesWritten: Number(entry.jokesWritten) || 0,
            practiceMinutes: Number(entry.practiceMinutes) || 0,
            updatedAt: entry.updatedAt || `${entry.date}T12:00:00.000Z`,
          });
        }
        commitProgress([...progressByDate.values()]);

        const activeSetlist = readValue(KEYS.ACTIVE_SETLIST);
        setActiveSetlistIdState(activeSetlist);
        activeSetlistIdRef.current = activeSetlist;

        const loadedProfile = parseStored<Partial<UserProfile>>(readValue(KEYS.PROFILE), {});
        commitProfile({
          displayName: loadedProfile.displayName || 'Comedian',
          comedyStyle: loadedProfile.comedyStyle || 'observational',
          crowdType: loadedProfile.crowdType || 'any',
        });

        const settingsUpdatedAt = readValue(KEYS.SETTINGS_UPDATED) ?? '';
        settingsUpdatedAtRef.current = settingsUpdatedAt;
        const lastSyncedAt = readValue(KEYS.LAST_SYNC);
        const initialMigrationComplete = readValue(KEYS.CLOUD_MIGRATED) === 'true';
        cloudMigratedRef.current = initialMigrationComplete;

        if (!mounted || syncGenerationRef.current !== generation) return;

        setSyncState({
          phase: isSupabaseConfigured ? 'idle' : 'unavailable',
          lastSyncedAt,
          pendingCount: 0,
          message: isSupabaseConfigured ? null : 'Cloud sync is not configured on this device.',
          initialMigrationComplete,
        });
        void refreshPendingCount();
        setIsLoading(false);

        if (isSupabaseConfigured) scheduleSyncRef.current(500);
      } catch (e) {
        console.error('Load error:', e);
      } finally {
        if (mounted && syncGenerationRef.current === generation) setIsLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [authUserId, commitIdeas, commitJokes, commitSetlists, commitRecordings, commitGigs, commitRatings, commitGoals, commitProgress, commitProfile, refreshPendingCount]);

  useEffect(() => {
    const applyUser = (authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | undefined) => {
      authUserIdRef.current = authUser?.id ?? null;
      setAuthUserId(authUser?.id ?? null);
      setIsAuthenticated(Boolean(authUser));
      setUserName(
        (authUser?.user_metadata?.full_name as string | undefined) ||
        (authUser?.user_metadata?.name as string | undefined) ||
        authUser?.email?.split('@')[0] ||
        'Comedian',
      );
    };

    supabase.auth.getSession().then(({ data }) => {
      applyUser(data.session?.user);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user);
    });

    const handleUrl = ({ url }: { url: string }) => {
      createSessionFromUrl(url).catch(error => console.error('Auth callback failed:', error));
    };
    const linkingListener = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(url => {
      if (url?.includes('auth/callback')) handleUrl({ url });
    });

    return () => {
      authListener.subscription.unsubscribe();
      linkingListener.remove();
    };
  }, []);

  // ─── Auth ──────────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    requireSupabaseConfiguration();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    requireSupabaseConfiguration();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, app_source: 'standup-companion' },
        emailRedirectTo: authRedirectTo,
      },
    });
    if (error) throw error;
    if (!data.session) {
      throw new Error('Account created. Check your email to confirm it, then log in.');
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await beginGoogleSignIn();
  }, []);

  const logout = useCallback(async () => {
    requireSupabaseConfiguration();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // ─── Profile ───────────────────────────────────────────────────────────────

  const updateProfile = useCallback(async (data: Partial<UserProfile>) => {
    const updated = { ...profileRef.current, ...data };
    commitProfile(updated);
    await AsyncStorage.setItem(storageKey(KEYS.PROFILE), JSON.stringify(updated));
    const updatedAt = touchSettings();
    queueSettings(updatedAt);
  }, [commitProfile, queueSettings, storageKey, touchSettings]);

  // ─── Ideas ─────────────────────────────────────────────────────────────────

  const addIdea = useCallback(async (data: Omit<Idea, 'id' | 'createdAt' | 'updatedAt'>): Promise<Idea> => {
    const now = new Date().toISOString();
    const idea: Idea = {
      ...data,
      tags: data.tags ?? [],
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    const updated = [idea, ...ideasRef.current];
    commitIdeas(updated);
    await saveIdeas(updated);
    queueOperation('idea', idea.id, 'upsert', idea, now);
    return idea;
  }, [commitIdeas, queueOperation, saveIdeas]);

  const updateIdea = useCallback(async (id: string, data: Partial<Idea>) => {
    const now = new Date().toISOString();
    const updated = ideasRef.current.map(i => i.id === id ? { ...i, ...data, updatedAt: now } : i);
    commitIdeas(updated);
    await saveIdeas(updated);
    const idea = updated.find(item => item.id === id);
    if (idea && !idea.deletedAt) queueOperation('idea', id, 'upsert', idea, now);
  }, [commitIdeas, queueOperation, saveIdeas]);

  const deleteIdea = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    const updated = ideasRef.current.map(i => i.id === id && !i.deletedAt
      ? { ...i, deletedAt: now, updatedAt: now }
      : i);
    if (!updated.some(i => i.id === id)) return;
    commitIdeas(updated);
    await saveIdeas(updated);
    const tombstone = updated.find(i => i.id === id);
    if (tombstone) queueOperation('idea', id, 'delete', tombstone, now);

    // Voice notes belong to the idea; remove them with it.
    const recordingsChanged = recordingsRef.current.some(r => r.kind === 'idea-note' && r.ideaId === id && !r.deletedAt);
    if (recordingsChanged) {
      const updatedRecordings = recordingsRef.current.map(r => r.kind === 'idea-note' && r.ideaId === id && !r.deletedAt
        ? { ...r, deletedAt: now, updatedAt: now }
        : r);
      commitRecordings(updatedRecordings);
      await saveRecordings(updatedRecordings);
      for (const recording of updatedRecordings) {
        if (recording.kind === 'idea-note' && recording.ideaId === id && recording.deletedAt === now) {
          queueOperation('recording', recording.id, 'delete', recording, now);
        }
      }
    }
  }, [commitIdeas, commitRecordings, queueOperation, saveIdeas, saveRecordings]);

  // ─── Jokes ─────────────────────────────────────────────────────────────────

  const addJoke = useCallback(async (data: Omit<Joke, 'id' | 'createdAt' | 'updatedAt' | 'versions'>): Promise<Joke> => {
    const now = new Date().toISOString();
    const joke: Joke = {
      ...data,
      jokeState: data.jokeState ?? 'draft',
      crowdType: data.crowdType ?? 'any',
      tags: data.tags ?? [],
      id: generateId(),
      versions: [],
      createdAt: now,
      updatedAt: now,
    };
    const updated = [joke, ...jokesRef.current];
    commitJokes(updated);
    await saveJokes(updated);
    queueOperation('joke', joke.id, 'upsert', joke, now);

    const updatedProgress = updateTodayProgress(progressRef.current, today(), 1, 0);
    commitProgress(updatedProgress);
    await saveProgress(updatedProgress);
    const todayRecord = updatedProgress.find(p => p.date === today());
    if (todayRecord) queueOperation('progress', todayRecord.id, 'upsert', todayRecord, todayRecord.updatedAt ?? now);
    return joke;
  }, [commitJokes, commitProgress, queueOperation, saveJokes, saveProgress]);

  const updateJoke = useCallback(async (id: string, data: Partial<Joke>) => {
    const now = new Date().toISOString();
    const updated = jokesRef.current.map(j => j.id === id ? { ...j, ...data, updatedAt: now } : j);
    commitJokes(updated);
    await saveJokes(updated);
    const joke = updated.find(item => item.id === id);
    if (joke && !joke.deletedAt) queueOperation('joke', id, 'upsert', joke, now);
  }, [commitJokes, queueOperation, saveJokes]);

  const deleteJoke = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    const updatedJokes = jokesRef.current.map(j => j.id === id && !j.deletedAt
      ? { ...j, deletedAt: now, updatedAt: now }
      : j);
    if (!updatedJokes.some(j => j.id === id)) return;
    commitJokes(updatedJokes);
    await saveJokes(updatedJokes);
    const tombstone = updatedJokes.find(j => j.id === id);
    if (tombstone) queueOperation('joke', id, 'delete', tombstone, now);

    // Remove dangling references so setlists and stats stay consistent.
    const changedSetlistIds = new Set<string>();
    const updatedSetlists = setlistsRef.current.map(s => {
      if (!s.jokes.some(j => j.jokeId === id) || s.deletedAt) return s;
      changedSetlistIds.add(s.id);
      return { ...s, jokes: s.jokes.filter(j => j.jokeId !== id), updatedAt: now };
    });
    if (changedSetlistIds.size) {
      commitSetlists(updatedSetlists);
      await saveSetlists(updatedSetlists);
      for (const setlist of updatedSetlists) {
        if (changedSetlistIds.has(setlist.id) && !setlist.deletedAt) {
          queueOperation('setlist', setlist.id, 'upsert', setlist, now);
        }
      }
    }

    const removedRatings = ratingsRef.current.filter(r => r.jokeId === id && !r.deletedAt);
    if (removedRatings.length) {
      const updatedRatings = ratingsRef.current.map(r => r.jokeId === id && !r.deletedAt
        ? { ...r, deletedAt: now, updatedAt: now }
        : r);
      commitRatings(updatedRatings);
      await saveRatings(updatedRatings);
      for (const rating of updatedRatings) {
        if (rating.jokeId === id && rating.deletedAt === now) {
          queueOperation('rating', rating.id, 'delete', rating, now);
        }
      }
    }

    const voiceTakes = recordingsRef.current.filter(r => r.kind === 'voice-take' && r.jokeId === id && !r.deletedAt);
    if (voiceTakes.length) {
      const updatedRecordings = recordingsRef.current.map(r => r.kind === 'voice-take' && r.jokeId === id && !r.deletedAt
        ? { ...r, deletedAt: now, updatedAt: now }
        : r);
      commitRecordings(updatedRecordings);
      await saveRecordings(updatedRecordings);
      for (const recording of updatedRecordings) {
        if (recording.kind === 'voice-take' && recording.jokeId === id && recording.deletedAt === now) {
          queueOperation('recording', recording.id, 'delete', recording, now);
        }
      }
    }
  }, [commitJokes, commitRatings, commitRecordings, commitSetlists, queueOperation, saveJokes, saveRatings, saveRecordings, saveSetlists]);

  const saveJokeVersion = useCallback(async (jokeId: string, note = '') => {
    const joke = jokesRef.current.find(j => j.id === jokeId);
    if (!joke) return;
    const nextVersion = joke.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const version: JokeVersion = {
      id: generateId(),
      version: nextVersion,
      setup: joke.setup,
      punchline: joke.punchline,
      tag: joke.tag,
      callback: joke.callback,
      createdAt: new Date().toISOString(),
      note,
    };
    const versions = [...joke.versions, version].slice(-20);
    const now = new Date().toISOString();
    const updated = jokesRef.current.map(j => j.id === jokeId
      ? { ...j, versions, updatedAt: now }
      : j);
    commitJokes(updated);
    await saveJokes(updated);
    const saved = updated.find(item => item.id === jokeId);
    if (saved && !saved.deletedAt) queueOperation('joke', jokeId, 'upsert', saved, now);
  }, [commitJokes, queueOperation, saveJokes]);

  const revertJokeVersion = useCallback(async (jokeId: string, versionId: string) => {
    const joke = jokesRef.current.find(j => j.id === jokeId);
    if (!joke) return;
    const version = joke.versions.find(v => v.id === versionId);
    if (!version) return;

    const snapshot: JokeVersion = {
      id: generateId(),
      version: joke.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1,
      setup: joke.setup,
      punchline: joke.punchline,
      tag: joke.tag,
      callback: joke.callback,
      createdAt: new Date().toISOString(),
      note: 'Pre-revert snapshot',
    };
    const versions = [...joke.versions, snapshot].slice(-20);
    const now = new Date().toISOString();
    const updated = jokesRef.current.map(j => j.id === jokeId
      ? {
          ...j,
          setup: version.setup,
          punchline: version.punchline,
          tag: version.tag,
          callback: version.callback,
          versions,
          updatedAt: now,
        }
      : j);
    commitJokes(updated);
    await saveJokes(updated);
    const saved = updated.find(item => item.id === jokeId);
    if (saved && !saved.deletedAt) queueOperation('joke', jokeId, 'upsert', saved, now);
  }, [commitJokes, queueOperation, saveJokes]);

  // ─── Setlists ──────────────────────────────────────────────────────────────

  const addSetlist = useCallback(async (name: string, crowdType: CrowdType = 'any'): Promise<Setlist> => {
    const now = new Date().toISOString();
    const setlist: Setlist = {
      id: generateId(),
      name,
      jokes: [],
      crowdType,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [setlist, ...setlistsRef.current];
    commitSetlists(updated);
    await saveSetlists(updated);
    queueOperation('setlist', setlist.id, 'upsert', setlist, now);
    return setlist;
  }, [commitSetlists, queueOperation, saveSetlists]);

  const updateSetlist = useCallback(async (id: string, data: Partial<Setlist>) => {
    const now = new Date().toISOString();
    const updated = setlistsRef.current.map(s => s.id === id ? { ...s, ...data, updatedAt: now } : s);
    commitSetlists(updated);
    await saveSetlists(updated);
    const setlist = updated.find(item => item.id === id);
    if (setlist && !setlist.deletedAt) queueOperation('setlist', id, 'upsert', setlist, now);
  }, [commitSetlists, queueOperation, saveSetlists]);

  const deleteSetlist = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    const updated = setlistsRef.current.map(s => s.id === id && !s.deletedAt
      ? { ...s, deletedAt: now, updatedAt: now }
      : s);
    if (!updated.some(s => s.id === id)) return;
    commitSetlists(updated);
    await saveSetlists(updated);
    const tombstone = updated.find(s => s.id === id);
    if (tombstone) queueOperation('setlist', id, 'delete', tombstone, now);
    if (activeSetlistIdRef.current === id) setActiveSetlistId(null);
  }, [commitSetlists, queueOperation, saveSetlists, setActiveSetlistId]);

  const duplicateSetlist = useCallback(async (id: string) => {
    const original = setlistsRef.current.find(s => s.id === id && !s.deletedAt);
    if (!original) return;
    const now = new Date().toISOString();
    const copy: Setlist = {
      ...original,
      id: generateId(),
      name: original.name + ' (copy)',
      jokes: [...original.jokes],
      isActive: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
    };
    const updated = [copy, ...setlistsRef.current];
    commitSetlists(updated);
    await saveSetlists(updated);
    queueOperation('setlist', copy.id, 'upsert', copy, now);
  }, [commitSetlists, queueOperation, saveSetlists]);

  const addJokeToSetlist = useCallback(async (setlistId: string, jokeId: string, duration: number) => {
    const setlist = setlistsRef.current.find(s => s.id === setlistId);
    if (!setlist) return;
    if (setlist.jokes.some(j => j.jokeId === jokeId)) return;
    const totalSecs = setlist.jokes.reduce((a, j) => a + j.duration, 0) + duration;
    if (totalSecs > 3600) throw new Error('OVER_60');

    const jokesUpdated = [...setlist.jokes, { jokeId, duration }];
    await updateSetlist(setlistId, { jokes: jokesUpdated });
    await updateJoke(jokeId, { jokeState: 'in-set' });
  }, [updateSetlist, updateJoke]);

  const removeJokeFromSetlist = useCallback(async (setlistId: string, jokeId: string) => {
    const setlist = setlistsRef.current.find(s => s.id === setlistId);
    if (!setlist) return;
    await updateSetlist(setlistId, { jokes: setlist.jokes.filter(j => j.jokeId !== jokeId) });

    const stillInSet = setlistsRef.current.some(s => s.id !== setlistId && s.jokes.some(j => j.jokeId === jokeId));
    if (!stillInSet) {
      const joke = jokesRef.current.find(j => j.id === jokeId);
      if (joke && joke.jokeState === 'in-set') await updateJoke(jokeId, { jokeState: 'stage-ready' });
    }
  }, [updateSetlist, updateJoke]);

  const reorderSetlistJokes = useCallback(async (setlistId: string, jokesList: SetlistJoke[]) => {
    await updateSetlist(setlistId, { jokes: jokesList });
  }, [updateSetlist]);

  // ─── Recordings ────────────────────────────────────────────────────────────

  const addRecording = useCallback(async (data: Omit<Recording, 'id' | 'createdAt'>): Promise<Recording> => {
    const now = new Date().toISOString();
    const rec: Recording = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      uploadStatus: 'local',
      uploadProgress: 0,
      mimeType: data.mimeType ?? 'audio/mp4',
    };
    const updated = [rec, ...recordingsRef.current];
    commitRecordings(updated);
    await saveRecordings(updated);
    queueOperation('recording', rec.id, 'upsert', rec, now);
    return rec;
  }, [commitRecordings, queueOperation, saveRecordings]);

  const updateRecording = useCallback(async (id: string, data: Partial<Recording>) => {
    const now = new Date().toISOString();
    const updated = recordingsRef.current.map(recording => recording.id === id
      ? { ...recording, ...data, updatedAt: now }
      : recording);
    commitRecordings(updated);
    await saveRecordings(updated);
    const recording = updated.find(item => item.id === id);
    if (recording && !recording.deletedAt) queueOperation('recording', id, 'upsert', recording, now);
  }, [commitRecordings, queueOperation, saveRecordings]);

  const uploadRecording = useCallback(async (id: string) => {
    const recording = recordingsRef.current.find(item => item.id === id && !item.deletedAt);
    if (!recording) throw new Error('Recording not found.');
    if (!recording.uri) throw new Error('This recording is only available in the cloud.');
    const syncToken = recording.updatedAt ?? recording.createdAt;

    const updateRuntime = (changes: Partial<Recording>) => {
      const next = recordingsRef.current.map(item => item.id === id ? { ...item, ...changes } : item);
      commitRecordings(next);
      return next.find(item => item.id === id);
    };

    updateRuntime({ uploadStatus: 'uploading', uploadProgress: 0 });
    try {
      const result = await uploadRecordingToCloud(recording, progressValue => {
        updateRuntime({ uploadStatus: 'uploading', uploadProgress: progressValue });
      });
      const current = recordingsRef.current.find(item => item.id === id);
      if (!current || current.deletedAt) return;
      const editedDuringUpload = (current.updatedAt ?? current.createdAt) !== syncToken;
      updateRuntime({
        cloudPath: result.storagePath,
        mimeType: result.mimeType,
        uploadStatus: editedDuringUpload ? 'local' : 'synced',
        uploadProgress: 1,
      });
      await saveRecordings(recordingsRef.current);
      const userId = authUserIdRef.current;
      if (userId) {
        // Only clear the exact operation this upload completed. A newer edit or
        // a deletion queued meanwhile must stay queued.
        await getSyncQueue(userId).removeEntity('recording', id, syncToken);
      }
    } catch (error) {
      const failed = updateRuntime({ uploadStatus: 'failed', uploadProgress: 0 });
      await saveRecordings(recordingsRef.current);
      if (failed && !failed.deletedAt) {
        queueOperation('recording', id, 'upsert', failed, failed.updatedAt ?? failed.createdAt);
      }
      throw error;
    }
  }, [commitRecordings, queueOperation, saveRecordings]);

  const getRecordingPlaybackUri = useCallback(async (recording: Recording) => {
    if (recording.uri) return recording.uri;
    if (recording.cloudPath) return getSignedRecordingUrl(recording.cloudPath);
    throw new Error('No playable copy of this recording is available.');
  }, []);

  const deleteRecording = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    const updated = recordingsRef.current.map(recording => recording.id === id && !recording.deletedAt
      ? { ...recording, deletedAt: now, updatedAt: now }
      : recording);
    if (!updated.some(recording => recording.id === id)) return;
    commitRecordings(updated);
    await saveRecordings(updated);
    const tombstone = updated.find(recording => recording.id === id);
    if (tombstone) queueOperation('recording', id, 'delete', tombstone, now);
  }, [commitRecordings, queueOperation, saveRecordings]);

  // ─── Gigs ──────────────────────────────────────────────────────────────────

  const addGig = useCallback(async (data: Omit<Gig, 'id' | 'createdAt' | 'updatedAt'>): Promise<Gig> => {
    const now = new Date().toISOString();
    const gig: Gig = { ...data, id: generateId(), createdAt: now, updatedAt: now };
    const updated = [...gigsRef.current, gig];
    commitGigs(updated);
    await saveGigs(updated);
    queueOperation('gig', gig.id, 'upsert', gig, now);
    return gig;
  }, [commitGigs, queueOperation, saveGigs]);

  const updateGig = useCallback(async (id: string, data: Partial<Gig>) => {
    const now = new Date().toISOString();
    const updated = gigsRef.current.map(gig => gig.id === id
      ? { ...gig, ...data, updatedAt: now }
      : gig);
    commitGigs(updated);
    await saveGigs(updated);
    const gig = updated.find(item => item.id === id);
    if (gig && !gig.deletedAt) queueOperation('gig', id, 'upsert', gig, now);
  }, [commitGigs, queueOperation, saveGigs]);

  const syncGigToCalendar = useCallback(async (id: string) => {
    const gig = gigsRef.current.find(item => item.id === id && !item.deletedAt);
    if (!gig) throw new Error('Gig not found.');
    const calendarData = await syncGigEvent(gig);
    // Calendar linkage is device-local. Updating it must not change the gig's
    // cloud modification timestamp, otherwise linking a calendar on this phone
    // could overwrite a newer edit made on another device.
    const updated = gigsRef.current.map(item => item.id === id
      ? { ...item, ...calendarData }
      : item);
    commitGigs(updated);
    await saveGigs(updated);
  }, [commitGigs, saveGigs]);

  const deleteGig = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    const gig = gigsRef.current.find(item => item.id === id && !item.deletedAt);
    if (!gig) return;
    await deleteGigEvent(gig);
    const updated = gigsRef.current.map(item => item.id === id
      ? { ...item, deletedAt: now, updatedAt: now }
      : item);
    commitGigs(updated);
    await saveGigs(updated);
    const tombstone = updated.find(item => item.id === id);
    if (tombstone) queueOperation('gig', id, 'delete', tombstone, now);
  }, [commitGigs, queueOperation, saveGigs]);

  // ─── Ratings ───────────────────────────────────────────────────────────────

  const addRating = useCallback(async (data: Omit<JokeRating, 'id' | 'createdAt'>): Promise<JokeRating> => {
    const now = new Date().toISOString();
    const rating: JokeRating = { ...data, id: generateId(), createdAt: now, updatedAt: now };
    const updated = [rating, ...ratingsRef.current];
    commitRatings(updated);
    await saveRatings(updated);
    queueOperation('rating', rating.id, 'upsert', rating, now);
    await applyRatingStats(updated, [data.jokeId]);
    return rating;
  }, [applyRatingStats, commitRatings, queueOperation, saveRatings]);

  const addRatings = useCallback(async (entries: Omit<JokeRating, 'id' | 'createdAt'>[]): Promise<JokeRating[]> => {
    if (entries.length === 0) return [];
    const createdAt = new Date().toISOString();
    const newRatings: JokeRating[] = entries.map(data => ({
      ...data,
      id: generateId(),
      createdAt,
      updatedAt: createdAt,
    }));
    const updated = [...newRatings, ...ratingsRef.current];
    commitRatings(updated);
    await saveRatings(updated);
    for (const rating of newRatings) {
      queueOperation('rating', rating.id, 'upsert', rating, createdAt);
    }
    await applyRatingStats(updated, Array.from(new Set(entries.map(e => e.jokeId))));
    return newRatings;
  }, [applyRatingStats, commitRatings, queueOperation, saveRatings]);

  const updateRating = useCallback(async (id: string, data: Partial<JokeRating>) => {
    const existing = ratingsRef.current.find(r => r.id === id);
    const now = new Date().toISOString();
    const updated = ratingsRef.current.map(r => r.id === id ? { ...r, ...data, updatedAt: now } : r);
    commitRatings(updated);
    await saveRatings(updated);
    const rating = updated.find(item => item.id === id);
    if (rating && !rating.deletedAt) queueOperation('rating', id, 'upsert', rating, now);
    if (existing) await applyRatingStats(updated, [existing.jokeId]);
  }, [applyRatingStats, commitRatings, queueOperation, saveRatings]);

  const deleteRating = useCallback(async (id: string) => {
    const existing = ratingsRef.current.find(r => r.id === id && !r.deletedAt);
    if (!existing) return;
    const now = new Date().toISOString();
    const updated = ratingsRef.current.map(r => r.id === id
      ? { ...r, deletedAt: now, updatedAt: now }
      : r);
    commitRatings(updated);
    await saveRatings(updated);
    const tombstone = updated.find(item => item.id === id);
    if (tombstone) queueOperation('rating', id, 'delete', tombstone, now);
    await applyRatingStats(updated, [existing.jokeId]);
  }, [applyRatingStats, commitRatings, queueOperation, saveRatings]);

  const getJokeAvgScore = useCallback((jokeId: string): number | null => {
    const jokeRatings = ratingsRef.current.filter(r => r.jokeId === jokeId && !r.deletedAt);
    if (jokeRatings.length === 0) return null;
    return Math.round((jokeRatings.reduce((a, r) => a + r.laughScore, 0) / jokeRatings.length) * 10) / 10;
  }, []);

  const isLowPerformer = useCallback((jokeId: string): boolean => {
    const jokeRatings = ratingsRef.current.filter(r => r.jokeId === jokeId && !r.deletedAt);
    if (jokeRatings.length < 3) return false;
    const avg = jokeRatings.reduce((a, r) => a + r.laughScore, 0) / jokeRatings.length;
    return avg < 4.0;
  }, []);

  // ─── Goals ─────────────────────────────────────────────────────────────────

  const updateGoals = useCallback(async (data: Partial<Goals>) => {
    const updated = { ...goalsRef.current, ...data };
    commitGoals(updated);
    await AsyncStorage.setItem(storageKey(KEYS.GOALS), JSON.stringify(updated));
    const updatedAt = touchSettings();
    queueSettings(updatedAt);
  }, [commitGoals, queueSettings, storageKey, touchSettings]);

  // ─── Progress ──────────────────────────────────────────────────────────────

  function updateTodayProgress(prog: DailyProgress[], date: string, addJokes: number, addMinutes: number): DailyProgress[] {
    const now = new Date().toISOString();
    const id = progressRecordId(authUserIdRef.current ?? 'local', date);
    const existing = prog.find(p => !p.deletedAt && (p.id === id || p.date === date));
    if (existing) {
      return prog.map(p => p.id === existing.id
        ? {
            ...p,
            id,
            date,
            jokesWritten: p.jokesWritten + addJokes,
            practiceMinutes: p.practiceMinutes + addMinutes,
            updatedAt: now,
          }
        : p);
    }
    return [...prog, { id, date, jokesWritten: addJokes, practiceMinutes: addMinutes, updatedAt: now }];
  }

  const recordPracticeMinutes = useCallback(async (minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const updated = updateTodayProgress(progressRef.current, today(), 0, Math.round(minutes));
    commitProgress(updated);
    await saveProgress(updated);
    const todayRecord = updated.find(p => p.date === today());
    if (todayRecord) queueOperation('progress', todayRecord.id, 'upsert', todayRecord, todayRecord.updatedAt ?? new Date().toISOString());
  }, [commitProgress, queueOperation, saveProgress]);

  const todayProgress = useMemo(() => {
    const date = today();
    return progress.find(p => p.date === date) || {
      id: progressRecordId(authUserId ?? 'local', date),
      date,
      jokesWritten: 0,
      practiceMinutes: 0,
    };
  }, [authUserId, progress]);

  const writingStreak = useMemo(() => computeStreak(progress), [progress]);

  // ─── Reset All Data ─────────────────────────────────────────────────────────

  const resetAllData = useCallback(async () => {
    const userId = authUserIdRef.current;
    syncGenerationRef.current += 1;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (userId) await clearSyncQueue(userId);
    await clearLocalCacheAndState(userId);
    setSyncState({
      phase: isSupabaseConfigured ? 'idle' : 'unavailable',
      lastSyncedAt: null,
      pendingCount: 0,
      message: isSupabaseConfigured
        ? 'Local cache cleared. Your cloud backup was left untouched.'
        : 'Local cache cleared.',
      initialMigrationComplete: false,
    });
  }, [clearLocalCacheAndState]);

  const value = useMemo<DataContextValue>(() => ({
    isAuthenticated, isLoading, login, register, signInWithGoogle, logout, userName,
    profile, updateProfile,
    ideas, addIdea, updateIdea, deleteIdea,
    jokes, addJoke, updateJoke, deleteJoke, saveJokeVersion, revertJokeVersion,
    setlists, activeSetlistId, setActiveSetlistId, addSetlist, updateSetlist, deleteSetlist, duplicateSetlist,
    addJokeToSetlist, removeJokeFromSetlist, reorderSetlistJokes,
    recordings, addRecording, updateRecording, uploadRecording, getRecordingPlaybackUri, deleteRecording,
    gigs, addGig, updateGig, syncGigToCalendar, deleteGig,
    ratings, addRating, addRatings, updateRating, deleteRating, getJokeAvgScore, isLowPerformer,
    goals, updateGoals,
    progress, recordPracticeMinutes, todayProgress, writingStreak,
    todayPrompt: getTodayPrompt(),
    syncState, syncNow, retrySync, deleteCloudAccountData,
    resetAllData,
  }), [
    isAuthenticated, isLoading, login, register, signInWithGoogle, logout, userName,
    profile, updateProfile,
    ideas, addIdea, updateIdea, deleteIdea,
    jokes, addJoke, updateJoke, deleteJoke, saveJokeVersion, revertJokeVersion,
    setlists, activeSetlistId, setActiveSetlistId, addSetlist, updateSetlist, deleteSetlist, duplicateSetlist,
    addJokeToSetlist, removeJokeFromSetlist, reorderSetlistJokes,
    recordings, addRecording, updateRecording, uploadRecording, getRecordingPlaybackUri, deleteRecording,
    gigs, addGig, updateGig, syncGigToCalendar, deleteGig,
    ratings, addRating, addRatings, updateRating, deleteRating, getJokeAvgScore, isLowPerformer,
    goals, updateGoals,
    progress, recordPracticeMinutes, todayProgress, writingStreak,
    syncState, syncNow, retrySync, deleteCloudAccountData,
    resetAllData,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
