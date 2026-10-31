import type {
  DailyProgress,
  Gig,
  Idea,
  Joke,
  JokeRating,
  Setlist,
} from '../context/DataContext';
import { fetchCloudRecordings, RECORDING_BUCKET } from './recording-storage';
import { requireSupabaseConfiguration, supabase } from './supabase';
import type { SyncEntityType, SyncSnapshot, SyncedUserSettings } from './sync-types';

type CloudRow = {
  id: string;
  user_id: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  local_date?: string;
};

export interface CloudDataSnapshot {
  snapshot: SyncSnapshot;
  recordingTombstones: string[];
}

type PayloadEntity = Exclude<SyncEntityType, 'settings' | 'recording' | 'performanceSession' | 'sessionEvent' | 'sessionReview'>;
const ENTITY_TABLES: Record<PayloadEntity, string> = {
  idea: 'standup_ideas',
  joke: 'standup_jokes',
  setlist: 'standup_setlists',
  gig: 'standup_gigs',
  rating: 'standup_ratings',
  progress: 'standup_daily_progress',
};

export function progressRecordId(userId: string, date: string): string {
  return `${userId}:${date}`;
}

function withTimestamps<T extends { createdAt?: string; updatedAt?: string; deletedAt?: string }>(
  payload: Record<string, unknown> | null,
  row: CloudRow,
): T {
  return {
    ...(payload ?? {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? (payload?.deletedAt as string | undefined) ?? undefined,
  } as unknown as T;
}

function normalizeIdea(row: CloudRow): Idea {
  return { ...withTimestamps<Idea>(row.payload, row), id: row.id };
}
function normalizeJoke(row: CloudRow): Joke {
  return { ...withTimestamps<Joke>(row.payload, row), id: row.id };
}
function normalizeSetlist(row: CloudRow): Setlist {
  return { ...withTimestamps<Setlist>(row.payload, row), id: row.id };
}
function normalizeGig(row: CloudRow): Gig {
  return { ...withTimestamps<Gig>(row.payload, row), id: row.id };
}
function normalizeRating(row: CloudRow): JokeRating {
  return { ...withTimestamps<JokeRating>(row.payload, row), id: row.id };
}
function normalizeProgress(row: CloudRow): DailyProgress {
  const payload = (row.payload ?? {}) as unknown as DailyProgress;
  return {
    ...withTimestamps<DailyProgress>(row.payload, row),
    id: row.id,
    date: payload.date || row.local_date || '',
    jokesWritten: Number(payload.jokesWritten ?? 0),
    practiceMinutes: Number(payload.practiceMinutes ?? 0),
  };
}

async function fetchRows(table: string, userId: string): Promise<CloudRow[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as CloudRow[];
}

export async function fetchCloudSnapshot(userId: string): Promise<CloudDataSnapshot> {
  requireSupabaseConfiguration();

  const [ideaRows, jokeRows, setlistRows, gigRows, ratingRows, progressRows, recordingRows, tombstoneResult, settingsResult] = await Promise.all([
    fetchRows(ENTITY_TABLES.idea, userId),
    fetchRows(ENTITY_TABLES.joke, userId),
    fetchRows(ENTITY_TABLES.setlist, userId),
    fetchRows(ENTITY_TABLES.gig, userId),
    fetchRows(ENTITY_TABLES.rating, userId),
    fetchRows(ENTITY_TABLES.progress, userId),
    fetchCloudRecordings(userId),
    supabase.from('standup_recording_tombstones').select('recording_id, deleted_at').eq('user_id', userId),
    supabase.from('standup_user_settings').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  if (tombstoneResult.error) throw tombstoneResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const tombstoneRows = (tombstoneResult.data ?? []) as Array<{ recording_id: string; deleted_at: string }>;

  const settingsRow = settingsResult.data as CloudRow | null;
  const settings = settingsRow
    ? ({ ...(settingsRow.payload ?? {}), updatedAt: settingsRow.updated_at } as unknown as SyncedUserSettings)
    : null;

  return {
    snapshot: {
      ideas: ideaRows.map(normalizeIdea),
      jokes: jokeRows.map(normalizeJoke),
      setlists: setlistRows.map(normalizeSetlist),
      gigs: gigRows.map(normalizeGig),
      ratings: ratingRows.map(normalizeRating),
      progress: progressRows.map(normalizeProgress),
      recordings: recordingRows,
      settings,
    },
    recordingTombstones: tombstoneRows.map(row => row.recording_id),
  };
}

function stripGigCalendarFields(gig: Gig): Omit<Gig, 'calendarId' | 'calendarEventId' | 'calendarSyncedAt'> {
  const { calendarId: _calendarId, calendarEventId: _calendarEventId, calendarSyncedAt: _calendarSyncedAt, ...rest } = gig;
  return rest;
}

function payloadFor(type: SyncEntityType, record: Record<string, unknown>): Record<string, unknown> {
  if (type === 'gig') return stripGigCalendarFields(record as unknown as Gig) as unknown as Record<string, unknown>;
  return record;
}

function recordTimestamps(record: Record<string, unknown>, operation: 'upsert' | 'delete') {
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString();
  const updatedAt = typeof record.updatedAt === 'string'
    ? record.updatedAt
    : createdAt;
  const deletedAt = operation === 'delete'
    ? (typeof record.deletedAt === 'string' ? record.deletedAt : new Date().toISOString())
    : (typeof record.deletedAt === 'string' ? record.deletedAt : null);
  return { createdAt, updatedAt, deletedAt };
}

export async function pushCloudEntity(
  userId: string,
  entityType: PayloadEntity | 'settings',
  record: Record<string, unknown>,
  operation: 'upsert' | 'delete',
): Promise<void> {
  requireSupabaseConfiguration();
  const { createdAt, updatedAt, deletedAt } = recordTimestamps(record, operation);
  const payload = { ...payloadFor(entityType, record), deletedAt: deletedAt ?? undefined };

  if (entityType === 'settings') {
    const { error } = await supabase.from('standup_user_settings').upsert({
      user_id: userId,
      payload,
      updated_at: updatedAt,
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return;
  }

  const table = ENTITY_TABLES[entityType];
  const id = entityType === 'progress'
    ? progressRecordId(userId, String(record.date ?? ''))
    : String(record.id);

  const row: Record<string, unknown> = {
    id,
    user_id: userId,
    payload,
    created_at: createdAt,
    updated_at: updatedAt,
    deleted_at: deletedAt,
  };
  if (entityType === 'progress') row.local_date = String(record.date ?? '');

  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteCloudEntity(
  userId: string,
  entityType: PayloadEntity | 'settings',
  entityId: string,
): Promise<void> {
  requireSupabaseConfiguration();
  if (entityType === 'settings') {
    const { error } = await supabase.from('standup_user_settings').delete().eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(ENTITY_TABLES[entityType]).delete().eq('id', entityId).eq('user_id', userId);
  if (error) throw error;
}

/**
 * Permanently removes every account-owned row and private audio object. Only
 * used by the explicit "delete cloud account data" confirmation flow.
 */
export async function deleteAllCloudData(userId: string): Promise<void> {
  requireSupabaseConfiguration();

  // Remove the private audio first. If this fails, no rows have been touched
  // yet and the whole deletion can be retried safely. A failure after this
  // point can leave orphaned metadata, but never orphaned audio.
  const pageSize = 500;
  const paths: string[] = [];
  for (let offset = 0; offset < 10_000; offset += pageSize) {
    const { data: objects, error: listError } = await supabase
      .storage
      .from(RECORDING_BUCKET)
      .list(userId, { limit: pageSize, offset });
    if (listError) throw listError;
    for (const object of objects ?? []) {
      if (object.name) paths.push(`${userId}/${object.name}`);
    }
    if ((objects ?? []).length < pageSize) break;
  }
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from(RECORDING_BUCKET).remove(paths);
    if (removeError) throw removeError;
  }

  for (const table of Object.values(ENTITY_TABLES)) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) throw error;
  }

  const { error: settingsError } = await supabase.from('standup_user_settings').delete().eq('user_id', userId);
  if (settingsError) throw settingsError;

  const { error: recordingsError } = await supabase.from('standup_recordings').delete().eq('user_id', userId);
  if (recordingsError) throw recordingsError;

  const { error: tombstonesError } = await supabase.from('standup_recording_tombstones').delete().eq('user_id', userId);
  if (tombstonesError) throw tombstonesError;
}
