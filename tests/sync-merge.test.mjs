import assert from 'node:assert/strict';
import test from 'node:test';

import syncMerge from '../lib/sync-merge.ts';

const {
  chooseRecord,
  mergeRecordLists,
  mergeSnapshots,
  stableSerialize,
} = syncMerge;

const BASE = '2026-10-01T10:00:00.000Z';
const NEWER = '2026-10-02T10:00:00.000Z';
const NEWEST = '2026-10-03T10:00:00.000Z';

function idea(overrides = {}) {
  return {
    id: 'idea-1',
    title: 'Airport ritual',
    body: 'Everyone claps when the plane lands.',
    status: 'raw',
    tags: [],
    createdAt: BASE,
    updatedAt: BASE,
    ...overrides,
  };
}

function joke(overrides = {}) {
  return {
    id: 'joke-1',
    title: 'Airplane clappers',
    setup: 'Why do people clap when a plane lands?',
    punchline: 'The pilot cannot hear you.',
    tag: '',
    callback: '',
    tags: [],
    duration: 45,
    jokeState: 'draft',
    versions: [],
    createdAt: BASE,
    updatedAt: BASE,
    ...overrides,
  };
}

function setlist(overrides = {}) {
  return {
    id: 'setlist-1',
    name: 'Tight five',
    jokes: [],
    crowdType: 'any',
    isActive: false,
    createdAt: BASE,
    updatedAt: BASE,
    ...overrides,
  };
}

function gig(overrides = {}) {
  return {
    id: 'gig-1',
    title: 'Comedy cellar',
    venue: 'Basement',
    startsAt: NEWER,
    notes: '',
    createdAt: BASE,
    updatedAt: BASE,
    ...overrides,
  };
}

function rating(overrides = {}) {
  return {
    id: 'rating-1',
    jokeId: 'joke-1',
    performanceDate: '2026-10-01',
    rating: 4,
    laughScore: 4,
    notes: '',
    crowdType: 'any',
    kept: true,
    createdAt: BASE,
    updatedAt: BASE,
    ...overrides,
  };
}

function recording(overrides = {}) {
  return {
    id: 'recording-1',
    name: 'Take one',
    uri: 'file:///local/take.m4a',
    duration: 30_000,
    createdAt: BASE,
    updatedAt: BASE,
    kind: 'voice-take',
    jokeId: 'joke-1',
    uploadStatus: 'local',
    uploadProgress: 0,
    ...overrides,
  };
}

function progress(overrides = {}) {
  return {
    id: 'user-1:2026-10-01',
    date: '2026-10-01',
    jokesWritten: 1,
    practiceMinutes: 5,
    updatedAt: BASE,
    ...overrides,
  };
}

function settings(overrides = {}) {
  return {
    displayName: 'Comedian',
    comedyStyle: 'observational',
    crowdType: 'any',
    dailyWriteTarget: 2,
    dailyPracticeMinutes: 15,
    activeSetlistId: null,
    updatedAt: BASE,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
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

const pendingKey = item => `${item.entityType}:${item.entityId}`;

test('last-write-wins chooses the newer record regardless of merge order', () => {
  const local = idea({ title: 'local newer', updatedAt: NEWER });
  const cloud = idea({ title: 'cloud older', updatedAt: BASE });

  assert.equal(chooseRecord(local, cloud).title, 'local newer');
  assert.equal(chooseRecord(cloud, local).title, 'local newer');
  assert.equal(chooseRecord(cloud, local), local);

  const newerCloud = idea({ title: 'cloud newer', updatedAt: NEWEST });
  assert.equal(chooseRecord(local, newerCloud).title, 'cloud newer');
  assert.equal(chooseRecord(newerCloud, local).title, 'cloud newer');
});

test('equal timestamps prefer tombstones and break other ties deterministically', () => {
  const active = idea({ title: 'active' });
  const deleted = idea({ title: 'deleted', deletedAt: BASE, updatedAt: BASE });
  assert.equal(chooseRecord(active, deleted).deletedAt, BASE);
  assert.equal(chooseRecord(deleted, active).deletedAt, BASE);

  const first = idea({ title: 'A' });
  const second = idea({ title: 'B' });
  const chosen = chooseRecord(first, second);
  assert.equal(chosen, chooseRecord(second, first));
  assert.equal(stableSerialize(first) === stableSerialize({ ...first }), true);
});

test('local-only records are queued while cloud-only and identical records are not', () => {
  const localOnly = idea({ id: 'idea-local' });
  const shared = idea({ id: 'idea-shared' });
  const cloudOnly = idea({ id: 'idea-cloud' });
  const result = mergeRecordLists([localOnly, shared], [shared, cloudOnly]);

  assert.deepEqual(result.pendingIds, ['idea-local']);
  assert.equal(result.records.length, 3);
  assert.ok(result.records.some(record => record.id === 'idea-cloud'));
});

test('a newer local record is returned and flagged for upload', () => {
  const local = idea({ title: 'local edit', updatedAt: NEWER });
  const cloud = idea({ title: 'cloud old', updatedAt: BASE });
  const result = mergeRecordLists([local], [cloud]);

  assert.equal(result.records[0].title, 'local edit');
  assert.deepEqual(result.pendingIds, ['idea-1']);
});

test('a newer cloud record replaces local data without being re-uploaded', () => {
  const local = idea({ title: 'local old', updatedAt: BASE });
  const cloud = idea({ title: 'cloud edit', updatedAt: NEWER });
  const result = mergeRecordLists([local], [cloud]);

  assert.equal(result.records[0].title, 'cloud edit');
  assert.deepEqual(result.pendingIds, []);
});

test('a deletion tombstone removes visible data and prevents resurrection', () => {
  const local = idea({ title: 'stale', updatedAt: BASE });
  const deletedCloud = idea({ title: 'deleted', updatedAt: NEWER, deletedAt: NEWER });
  const merged = mergeSnapshots(snapshot({ ideas: [local] }), snapshot({ ideas: [deletedCloud] }));

  assert.equal(merged.snapshot.ideas[0].deletedAt, NEWER);
  assert.deepEqual(merged.pending, []);

  const deletedLocal = idea({ title: 'deleted locally', updatedAt: NEWER, deletedAt: NEWER });
  const activeCloud = idea({ title: 'stale cloud', updatedAt: BASE });
  const localDelete = mergeSnapshots(snapshot({ ideas: [deletedLocal] }), snapshot({ ideas: [activeCloud] }));

  assert.equal(localDelete.snapshot.ideas[0].deletedAt, NEWER);
  assert.deepEqual(localDelete.pending, [{ entityType: 'idea', entityId: 'idea-1' }]);
});

test('setlist ordering is preserved as part of the setlist record', () => {
  const ordered = [
    { jokeId: 'joke-b', duration: 60 },
    { jokeId: 'joke-a', duration: 30 },
  ];
  const local = setlist({ jokes: ordered, updatedAt: NEWER });
  const cloud = setlist({ jokes: [...ordered].reverse(), updatedAt: BASE });
  const result = mergeRecordLists([local], [cloud]);

  assert.deepEqual(result.records[0].jokes, ordered);
  assert.deepEqual(result.pendingIds, ['setlist-1']);
});

test('joke version history is kept when the local joke wins', () => {
  const versions = [
    { id: 'version-1', version: 1, setup: 'old', punchline: 'old', tag: '', callback: '', createdAt: BASE, note: '' },
    { id: 'version-2', version: 2, setup: 'new', punchline: 'new', tag: '', callback: '', createdAt: NEWER, note: 'tightened' },
  ];
  const local = joke({ versions, updatedAt: NEWER });
  const cloud = joke({ versions: [], updatedAt: BASE });
  const merged = mergeSnapshots(snapshot({ jokes: [local] }), snapshot({ jokes: [cloud] }));

  assert.deepEqual(merged.snapshot.jokes[0].versions, versions);
  assert.deepEqual(merged.pending.map(pendingKey), ['joke:joke-1']);
});

test('derived joke statistics are rebuilt from the merged active ratings', () => {
  const cloudJoke = joke({
    updatedAt: NEWER,
    avgScore: 1,
    performanceCount: 1,
    lastPerformedAt: '2026-10-01',
  });
  const merged = mergeSnapshots(snapshot(), snapshot({
    jokes: [cloudJoke],
    ratings: [
      rating({ id: 'rating-1', laughScore: 5, performanceDate: '2026-10-02' }),
      rating({ id: 'rating-2', laughScore: 4, performanceDate: '2026-10-03' }),
      rating({ id: 'rating-deleted', laughScore: 1, performanceDate: '2026-10-04', deletedAt: NEWER, updatedAt: NEWER }),
    ],
  }));

  const result = merged.snapshot.jokes[0];
  assert.equal(result.avgScore, 4.5);
  assert.equal(result.performanceCount, 2);
  assert.equal(result.lastPerformedAt, '2026-10-03');
  assert.ok(merged.pending.some(item => item.entityType === 'joke' && item.entityId === 'joke-1'));
});

test('correct derived joke statistics do not create extra uploads', () => {
  const correct = joke({
    avgScore: 4.5,
    performanceCount: 2,
    lastPerformedAt: '2026-10-03',
  });
  const merged = mergeSnapshots(snapshot(), snapshot({
    jokes: [correct],
    ratings: [
      rating({ id: 'rating-1', laughScore: 5, performanceDate: '2026-10-02' }),
      rating({ id: 'rating-2', laughScore: 4, performanceDate: '2026-10-03' }),
    ],
  }));

  assert.deepEqual(merged.pending, []);
});

test('deleting a joke cascades to setlist entries, ratings and voice takes', () => {
  const deletedJoke = joke({ deletedAt: NEWER, updatedAt: NEWER });
  const setlistRecord = setlist({
    jokes: [
      { jokeId: 'joke-1', duration: 45 },
      { jokeId: 'joke-2', duration: 30 },
    ],
  });
  const ratingRecord = rating({ updatedAt: BASE });
  const voiceTake = recording({ kind: 'voice-take', jokeId: 'joke-1', updatedAt: BASE });
  const performance = recording({
    id: 'recording-performance',
    kind: 'performance',
    jokeId: undefined,
    updatedAt: BASE,
  });

  const merged = mergeSnapshots(
    snapshot(),
    snapshot({
      jokes: [deletedJoke],
      setlists: [setlistRecord],
      ratings: [ratingRecord],
      recordings: [voiceTake, performance],
    }),
  );

  assert.deepEqual(merged.snapshot.setlists[0].jokes, [{ jokeId: 'joke-2', duration: 30 }]);
  assert.equal(merged.snapshot.setlists[0].updatedAt, NEWER);
  assert.equal(merged.snapshot.ratings[0].deletedAt, NEWER);
  assert.equal(merged.snapshot.recordings.find(item => item.id === 'recording-1').deletedAt, NEWER);
  assert.equal(merged.snapshot.recordings.find(item => item.id === 'recording-performance').deletedAt, undefined);

  const pending = new Set(merged.pending.map(pendingKey));
  assert.ok(pending.has('setlist:setlist-1'));
  assert.ok(pending.has('rating:rating-1'));
  assert.ok(pending.has('recording:recording-1'));
  assert.ok(!pending.has('recording:recording-performance'));
});

test('deleting an idea cascades to its idea voice notes only', () => {
  const deletedIdea = idea({ deletedAt: NEWER, updatedAt: NEWER });
  const ideaNote = recording({
    id: 'idea-note-1',
    kind: 'idea-note',
    ideaId: 'idea-1',
    jokeId: undefined,
    updatedAt: BASE,
  });
  const jokeTake = recording({
    id: 'joke-take-1',
    kind: 'voice-take',
    jokeId: 'joke-9',
    updatedAt: BASE,
  });
  const merged = mergeSnapshots(
    snapshot(),
    snapshot({ ideas: [deletedIdea], recordings: [ideaNote, jokeTake] }),
  );

  assert.equal(merged.snapshot.recordings.find(item => item.id === 'idea-note-1').deletedAt, NEWER);
  assert.equal(merged.snapshot.recordings.find(item => item.id === 'joke-take-1').deletedAt, undefined);
  assert.ok(merged.pending.some(item => item.entityType === 'recording' && item.entityId === 'idea-note-1'));
});

test('recording tombstones always win over stale offline metadata', () => {
  const staleLocal = recording({ updatedAt: NEWEST, uploadStatus: 'local' });
  const merged = mergeSnapshots(
    snapshot({ recordings: [staleLocal] }),
    snapshot(),
    { recordingTombstones: ['recording-1'] },
  );

  const result = merged.snapshot.recordings[0];
  assert.equal(result.deletedAt, NEWEST);
  assert.equal(result.updatedAt, NEWEST);
  assert.equal(result.uploadStatus, 'local');
  assert.deepEqual(merged.pending.map(pendingKey), ['recording:recording-1']);
});

test('cloud-only recordings become playable cloud entries while local-only ones stay queued', () => {
  const cloudOnly = recording({
    id: 'recording-cloud',
    uri: '',
    cloudPath: 'user-1/recording-cloud.m4a',
    uploadStatus: 'synced',
    updatedAt: BASE,
  });
  const localOnly = recording({ id: 'recording-local', uri: 'file:///take.m4a' });
  const merged = mergeSnapshots(snapshot({ recordings: [localOnly] }), snapshot({ recordings: [cloudOnly] }));

  const cloudResult = merged.snapshot.recordings.find(item => item.id === 'recording-cloud');
  assert.equal(cloudResult.uri, '');
  assert.equal(cloudResult.uploadStatus, 'synced');
  assert.equal(cloudResult.cloudPath, 'user-1/recording-cloud.m4a');
  assert.ok(merged.pending.some(item => item.entityId === 'recording-local'));
  assert.ok(!merged.pending.some(item => item.entityId === 'recording-cloud'));
});

test('identical recordings with a cloud copy are not re-uploaded', () => {
  const local = recording({ cloudPath: undefined });
  const cloud = recording({
    uri: '',
    cloudPath: 'user-1/recording-1.m4a',
    uploadStatus: 'synced',
    uploadProgress: 1,
  });
  const merged = mergeSnapshots(snapshot({ recordings: [local] }), snapshot({ recordings: [cloud] }));

  assert.deepEqual(merged.pending, []);
  assert.equal(merged.snapshot.recordings[0].cloudPath, 'user-1/recording-1.m4a');
  assert.equal(merged.snapshot.recordings[0].uploadStatus, 'synced');
});

test('gig calendar linkage stays device-local and does not trigger uploads', () => {
  const local = gig({
    calendarId: 'device-calendar',
    calendarEventId: 'event-on-phone-a',
    calendarSyncedAt: BASE,
  });
  const cloud = gig({
    title: 'Updated venue',
    updatedAt: NEWER,
  });
  const merged = mergeSnapshots(snapshot({ gigs: [local] }), snapshot({ gigs: [cloud] }));

  assert.equal(merged.snapshot.gigs[0].title, 'Updated venue');
  assert.equal(merged.snapshot.gigs[0].calendarId, 'device-calendar');
  assert.equal(merged.snapshot.gigs[0].calendarEventId, 'event-on-phone-a');
  assert.equal(merged.snapshot.gigs[0].calendarSyncedAt, BASE);
  assert.deepEqual(merged.pending, []);
});

test('account settings merge by timestamp with local-only data queued', () => {
  const localNewer = mergeSnapshots(
    snapshot({ settings: settings({ displayName: 'Local', updatedAt: NEWER }) }),
    snapshot({ settings: settings({ displayName: 'Cloud', updatedAt: BASE }) }),
  );
  assert.equal(localNewer.snapshot.settings.displayName, 'Local');
  assert.deepEqual(localNewer.pending.map(pendingKey), ['settings:user-settings']);

  const cloudNewer = mergeSnapshots(
    snapshot({ settings: settings({ displayName: 'Local', updatedAt: BASE }) }),
    snapshot({ settings: settings({ displayName: 'Cloud', updatedAt: NEWER }) }),
  );
  assert.equal(cloudNewer.snapshot.settings.displayName, 'Cloud');
  assert.deepEqual(cloudNewer.pending, []);

  const localOnly = mergeSnapshots(snapshot({ settings: settings() }), snapshot());
  assert.equal(localOnly.snapshot.settings.displayName, 'Comedian');
  assert.deepEqual(localOnly.pending.map(pendingKey), ['settings:user-settings']);
});

test('an explicit cloud active-setlist clear is not undone by stale local state', () => {
  const merged = mergeSnapshots(
    snapshot({ settings: settings({ activeSetlistId: 'setlist-old', updatedAt: BASE }) }),
    snapshot({ settings: settings({ activeSetlistId: null, updatedAt: NEWER }) }),
  );

  assert.equal(merged.snapshot.settings.activeSetlistId, null);
  assert.deepEqual(merged.pending, []);
});

test('daily progress merges by the per-user date id', () => {
  const local = progress({ jokesWritten: 3, updatedAt: NEWER });
  const cloud = progress({ jokesWritten: 1, updatedAt: BASE });
  const merged = mergeSnapshots(snapshot({ progress: [local] }), snapshot({ progress: [cloud] }));

  assert.equal(merged.snapshot.progress.length, 1);
  assert.equal(merged.snapshot.progress[0].jokesWritten, 3);
  assert.deepEqual(merged.pending.map(pendingKey), ['progress:user-1:2026-10-01']);
});

test('merge output is independent of argument order for identical timestamps', () => {
  const local = snapshot({
    ideas: [idea({ id: 'idea-a', title: 'A' }), idea({ id: 'idea-b', title: 'B', deletedAt: BASE })],
    jokes: [joke({ title: 'A' })],
    settings: settings({ displayName: 'A' }),
  });
  const cloud = snapshot({
    ideas: [idea({ id: 'idea-a', title: 'B' }), idea({ id: 'idea-b', title: 'C' })],
    jokes: [joke({ title: 'B' })],
    settings: settings({ displayName: 'B' }),
  });

  const forward = mergeSnapshots(local, cloud).snapshot;
  const backward = mergeSnapshots(cloud, local).snapshot;
  assert.deepEqual(forward, backward);
});
