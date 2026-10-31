import type { DailyProgress, Gig, Idea, Joke, JokeRating, Recording, Setlist } from '../context/DataContext';
import type { SyncEntityType, SyncSnapshot, SyncedUserSettings } from './sync-types';

type Timestamped = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
};

export interface PendingEntity {
  entityType: SyncEntityType;
  entityId: string;
}

export interface MergeResult {
  snapshot: SyncSnapshot;
  /** Records whose merged copy differs from the cloud copy and must be pushed. */
  pending: PendingEntity[];
}

export function recordTimestamp(record: Pick<Timestamped, 'createdAt' | 'updatedAt'>): string {
  return record.updatedAt || record.createdAt || '';
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) result[key] = stableNormalize(item);
        return result;
      }, {});
  }
  return value;
}

/** Deterministic serialization used only for equal-timestamp tie-breaking. */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

export function isDeleted(record: { deletedAt?: string } | null | undefined): boolean {
  return Boolean(record?.deletedAt);
}

/**
 * Deterministic last-write-wins comparison.
 * - Newer updatedAt/createdAt wins.
 * - At an equal timestamp, a tombstone beats an active record.
 * - Remaining ties are broken by a stable payload comparison so every device
 *   chooses the same record regardless of merge order.
 */
export function chooseRecord<T extends Timestamped>(local: T, cloud: T): T {
  const localTimestamp = recordTimestamp(local);
  const cloudTimestamp = recordTimestamp(cloud);
  if (localTimestamp !== cloudTimestamp) {
    return localTimestamp > cloudTimestamp ? local : cloud;
  }
  const localDeleted = Boolean(local.deletedAt);
  const cloudDeleted = Boolean(cloud.deletedAt);
  if (localDeleted !== cloudDeleted) return localDeleted ? local : cloud;
  return stableSerialize(local) >= stableSerialize(cloud) ? local : cloud;
}

function sortRecords<T extends Timestamped>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const byUpdated = recordTimestamp(b).localeCompare(recordTimestamp(a));
    return byUpdated !== 0 ? byUpdated : a.id.localeCompare(b.id);
  });
}

/** Merge a normal id-keyed entity list. */
export function mergeRecordLists<T extends Timestamped>(
  local: T[],
  cloud: T[],
  options: {
    /** Fields that are device-local and must never decide a cloud difference. */
    cloudComparable?: (record: T) => unknown;
    /** Preserve local-only fields on the winning record. */
    preserveLocalFields?: (winner: T, localRecord: T | undefined) => T;
  } = {},
): { records: T[]; pendingIds: string[] } {
  const localById = new Map(local.map(record => [record.id, record]));
  const cloudById = new Map(cloud.map(record => [record.id, record]));
  const ids = new Set([...localById.keys(), ...cloudById.keys()]);
  const records: T[] = [];
  const pendingIds: string[] = [];

  for (const id of ids) {
    const localRecord = localById.get(id);
    const cloudRecord = cloudById.get(id);

    if (!localRecord && cloudRecord) {
      records.push(cloudRecord);
      continue;
    }
    if (localRecord && !cloudRecord) {
      records.push(options.preserveLocalFields ? options.preserveLocalFields(localRecord, localRecord) : localRecord);
      pendingIds.push(id);
      continue;
    }
    if (!localRecord || !cloudRecord) continue;

    const winner = chooseRecord(localRecord, cloudRecord);
    const merged = options.preserveLocalFields
      ? options.preserveLocalFields(winner, localRecord)
      : winner;
    records.push(merged);

    if (winner === localRecord) {
      const comparableLocal = options.cloudComparable
        ? options.cloudComparable(localRecord)
        : localRecord;
      const comparableCloud = options.cloudComparable
        ? options.cloudComparable(cloudRecord)
        : cloudRecord;
      if (stableSerialize(comparableLocal) !== stableSerialize(comparableCloud)) {
        pendingIds.push(id);
      }
    }
  }

  return { records: sortRecords(records), pendingIds };
}

function withoutGigCalendarFields(gig: Gig): Omit<Gig, 'calendarId' | 'calendarEventId' | 'calendarSyncedAt'> {
  const { calendarId: _calendarId, calendarEventId: _calendarEventId, calendarSyncedAt: _calendarSyncedAt, ...rest } = gig;
  return rest;
}

function preserveGigCalendarFields(winner: Gig, localRecord: Gig | undefined): Gig {
  if (!localRecord) return winner;
  return {
    ...winner,
    calendarId: localRecord.calendarId,
    calendarEventId: localRecord.calendarEventId,
    calendarSyncedAt: localRecord.calendarSyncedAt,
  };
}

function withoutRecordingRuntimeFields(recording: Recording): Omit<Recording, 'uri' | 'uploadStatus' | 'uploadProgress' | 'cloudPath'> {
  const {
    uri: _uri,
    uploadStatus: _uploadStatus,
    uploadProgress: _uploadProgress,
    cloudPath: _cloudPath,
    ...rest
  } = recording;
  return rest;
}

function mergeRecordings(local: Recording[], cloud: Recording[]): { records: Recording[]; pendingIds: string[] } {
  const localById = new Map(local.map(record => [record.id, record]));
  const cloudById = new Map(cloud.map(record => [record.id, record]));
  const ids = new Set([...localById.keys(), ...cloudById.keys()]);
  const records: Recording[] = [];
  const pendingIds: string[] = [];

  for (const id of ids) {
    const localRecord = localById.get(id);
    const cloudRecord = cloudById.get(id);

    if (!localRecord && cloudRecord) {
      records.push({ ...cloudRecord, uri: '', uploadStatus: cloudRecord.deletedAt ? 'local' : 'synced' });
      continue;
    }
    if (localRecord && !cloudRecord) {
      records.push(localRecord);
      if (!localRecord.deletedAt) pendingIds.push(id);
      continue;
    }
    if (!localRecord || !cloudRecord) continue;

    const winner = chooseRecord(localRecord, cloudRecord);
    const winnerIsLocal = winner === localRecord;
    const cloudHasCopy = Boolean(cloudRecord.cloudPath) && !cloudRecord.deletedAt;
    const needsPush = winnerIsLocal &&
      stableSerialize(withoutRecordingRuntimeFields(localRecord)) !== stableSerialize(withoutRecordingRuntimeFields(cloudRecord));
    const merged: Recording = {
      ...winner,
      uri: localRecord.uri || '',
      cloudPath: cloudRecord.cloudPath ?? localRecord.cloudPath,
      uploadStatus: cloudRecord.deletedAt
        ? 'local'
        : needsPush
          ? (localRecord.uploadStatus === 'failed' ? 'failed' : (localRecord.uri ? 'local' : 'synced'))
          : (cloudHasCopy ? 'synced' : 'local'),
      uploadProgress: needsPush
        ? (localRecord.uploadProgress ?? 0)
        : (cloudHasCopy ? 1 : (localRecord.uploadProgress ?? 0)),
    };
    records.push(merged);

    if (needsPush) pendingIds.push(id);
  }

  return { records: sortRecords(records), pendingIds };
}

function mergeSettings(
  local: SyncedUserSettings | null,
  cloud: SyncedUserSettings | null,
): { settings: SyncedUserSettings | null; pendingId: string | null } {
  if (!local) return { settings: cloud, pendingId: null };
  if (!cloud) return { settings: local, pendingId: 'user-settings' };
  const localRecord = { ...local, id: 'user-settings' };
  const cloudRecord = { ...cloud, id: 'user-settings' };
  const winner = chooseRecord(localRecord, cloudRecord);
  const merged = {
    displayName: winner.displayName ?? local.displayName,
    comedyStyle: winner.comedyStyle ?? local.comedyStyle,
    crowdType: winner.crowdType ?? local.crowdType,
    scriptLanguage: winner.scriptLanguage ?? local.scriptLanguage ?? 'hinglish-romanized',
    dailyWriteTarget: Number.isFinite(winner.dailyWriteTarget) ? winner.dailyWriteTarget : local.dailyWriteTarget,
    dailyPracticeMinutes: Number.isFinite(winner.dailyPracticeMinutes) ? winner.dailyPracticeMinutes : local.dailyPracticeMinutes,
    // Preserve the local value only when an older client omitted the field
    // entirely. An explicit null from the winner means "no active setlist" and
    // must be allowed to clear it on every device.
    activeSetlistId: winner.activeSetlistId === undefined
      ? (local.activeSetlistId ?? null)
      : winner.activeSetlistId,
    updatedAt: winner.updatedAt,
  };
  const winnerIsLocal = winner === localRecord;
  const pendingId = winnerIsLocal && stableSerialize(merged) !== stableSerialize(cloud) ? 'user-settings' : null;
  return { settings: merged, pendingId };
}

function maxTimestamp(a: string | undefined, b: string | undefined): string {
  if (!a) return b ?? new Date(0).toISOString();
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Merges a local cache with a cloud snapshot using deterministic per-record
 * last-write-wins. Returns the merged snapshot plus the local winners that must
 * be uploaded. Recording tombstones always win so a hard-deleted audio object
 * cannot be resurrected by a stale offline copy.
 */
export function mergeSnapshots(
  local: SyncSnapshot,
  cloud: SyncSnapshot,
  options: { recordingTombstones?: string[] } = {},
): MergeResult {
  const pending: PendingEntity[] = [];

  const ideas = mergeRecordLists<Idea>(local.ideas, cloud.ideas);
  pending.push(...ideas.pendingIds.map(id => ({ entityType: 'idea' as const, entityId: id })));

  const jokes = mergeRecordLists<Joke>(local.jokes, cloud.jokes);
  pending.push(...jokes.pendingIds.map(id => ({ entityType: 'joke' as const, entityId: id })));

  const setlists = mergeRecordLists<Setlist>(local.setlists, cloud.setlists);
  pending.push(...setlists.pendingIds.map(id => ({ entityType: 'setlist' as const, entityId: id })));

  const gigs = mergeRecordLists<Gig>(local.gigs, cloud.gigs, {
    cloudComparable: withoutGigCalendarFields,
    preserveLocalFields: preserveGigCalendarFields,
  });
  pending.push(...gigs.pendingIds.map(id => ({ entityType: 'gig' as const, entityId: id })));

  const ratings = mergeRecordLists<JokeRating>(local.ratings, cloud.ratings);
  pending.push(...ratings.pendingIds.map(id => ({ entityType: 'rating' as const, entityId: id })));

  const progress = mergeRecordLists<DailyProgress>(local.progress, cloud.progress);
  pending.push(...progress.pendingIds.map(id => ({ entityType: 'progress' as const, entityId: id })));

  const recordings = mergeRecordings(local.recordings, cloud.recordings);
  pending.push(...recordings.pendingIds.map(id => ({ entityType: 'recording' as const, entityId: id })));

  // Hard-deleted recordings are represented by tombstones on the cloud and are
  // always applied, even if a stale device still has the old metadata.
  const tombstoneSet = new Set(options.recordingTombstones ?? []);
  if (tombstoneSet.size) {
    recordings.records = recordings.records.map(recording => {
      if (!tombstoneSet.has(recording.id) || recording.deletedAt) return recording;
      const deletedAt = recording.updatedAt ?? recording.createdAt;
      pending.push({ entityType: 'recording', entityId: recording.id });
      return {
        ...recording,
        deletedAt,
        updatedAt: deletedAt,
        uploadStatus: 'local' as const,
      };
    });
  }

  const settingsMerge = mergeSettings(local.settings, cloud.settings);
  if (settingsMerge.pendingId) pending.push({ entityType: 'settings', entityId: settingsMerge.pendingId });

  const deletedJokes = new Map(jokes.records
    .filter(joke => joke.deletedAt)
    .map(joke => [joke.id, joke]));
  const deletedIdeas = new Map(ideas.records
    .filter(idea => idea.deletedAt)
    .map(idea => [idea.id, idea]));

  // Keep dependent relationships valid. These cascades are also performed at
  // deletion time; this catches a device that was offline during the cascade.
  const sanitizedSetlists = setlists.records.map(setlist => {
    if (setlist.deletedAt) return setlist;
    const filtered = setlist.jokes.filter(entry => !deletedJokes.has(entry.jokeId));
    if (filtered.length === setlist.jokes.length) return setlist;
    let updatedAt = setlist.updatedAt;
    for (const entry of setlist.jokes) {
      const deleted = deletedJokes.get(entry.jokeId);
      if (deleted) updatedAt = maxTimestamp(updatedAt, deleted.updatedAt);
    }
    pending.push({ entityType: 'setlist', entityId: setlist.id });
    return { ...setlist, jokes: filtered, updatedAt };
  });

  const sanitizedRatings = ratings.records.map(rating => {
    if (rating.deletedAt) return rating;
    const deletedJoke = deletedJokes.get(rating.jokeId);
    if (!deletedJoke) return rating;
    const deletedAt = maxTimestamp(rating.updatedAt, deletedJoke.updatedAt);
    pending.push({ entityType: 'rating', entityId: rating.id });
    return { ...rating, deletedAt, updatedAt: deletedAt };
  });

  // Joke averages are derived from ratings. A joke record from another device
  // may carry stale aggregates, so rebuild them from the merged rating set and
  // push a correction when the stored values disagree.
  const activeRatings = sanitizedRatings.filter(rating => !rating.deletedAt);
  const recalculatedJokes = jokes.records.map(joke => {
    if (joke.deletedAt) return joke;
    const jokeRatings = activeRatings.filter(rating => rating.jokeId === joke.id);
    const avgScore = jokeRatings.length
      ? Math.round((jokeRatings.reduce((sum, rating) => sum + rating.laughScore, 0) / jokeRatings.length) * 10) / 10
      : undefined;
    const performanceCount = jokeRatings.length;
    const lastPerformedAt = jokeRatings.length
      ? [...jokeRatings].map(rating => rating.performanceDate).sort().slice(-1)[0]
      : undefined;
    if (
      joke.avgScore === avgScore &&
      (joke.performanceCount ?? 0) === performanceCount &&
      joke.lastPerformedAt === lastPerformedAt
    ) {
      return joke;
    }
    pending.push({ entityType: 'joke', entityId: joke.id });
    return { ...joke, avgScore, performanceCount, lastPerformedAt };
  });

  const sanitizedRecordings = recordings.records.map(recording => {
    if (recording.deletedAt) return recording;
    const linkedJoke = recording.kind === 'voice-take' && recording.jokeId
      ? deletedJokes.get(recording.jokeId)
      : undefined;
    const linkedIdea = recording.kind === 'idea-note' && recording.ideaId
      ? deletedIdeas.get(recording.ideaId)
      : undefined;
    const deletedParent = linkedJoke ?? linkedIdea;
    if (!deletedParent) return recording;
    const deletedAt = maxTimestamp(recording.updatedAt ?? recording.createdAt, deletedParent.updatedAt);
    pending.push({ entityType: 'recording', entityId: recording.id });
    return { ...recording, deletedAt, updatedAt: deletedAt, uploadStatus: 'local' as const };
  });

  return {
    snapshot: {
      ideas: ideas.records,
      jokes: recalculatedJokes,
      setlists: sanitizedSetlists,
      gigs: gigs.records,
      ratings: sanitizedRatings,
      progress: progress.records,
      recordings: sanitizedRecordings,
      settings: settingsMerge.settings,
    },
    pending: dedupePending(pending),
  };
}

function dedupePending(pending: PendingEntity[]): PendingEntity[] {
  const seen = new Set<string>();
  return pending.filter(item => {
    const key = `${item.entityType}:${item.entityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
