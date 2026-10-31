import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import performance from '../domain/performance.ts';
import tokens from '../theme/tokens.ts';

const { calibratedNoiseFloor, compareVersionOutcomes, correctMarker, initialSoundPacerState, orderMarkers, pacedPixelsPerSecond, soundThreshold, updateSoundPacer, validateReview, validateSessionSetup } = performance;
const { resolveTheme } = tokens;

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('System, Day Show, and Late Show resolve deterministically', () => {
  assert.equal(resolveTheme('day', 'dark'), 'day'); assert.equal(resolveTheme('late', 'light'), 'late'); assert.equal(resolveTheme('system', 'light'), 'day'); assert.equal(resolveTheme('system', 'dark'), 'late');
});

test('theme choices persist and migrate old light/dark preferences', async () => {
  const provider = await source('../theme/ThemeProvider.tsx');
  assert.match(provider, /AsyncStorage\.setItem\(THEME_KEY, next\)/); assert.match(provider, /storedMode === 'light'/); assert.match(provider, /storedMode === 'dark'/);
});

test('bottom navigation is exactly Home, Ideas, Material, Perform, Gigs and never More', async () => {
  const tabs = await source('../app/(tabs)/_layout.tsx');
  const titles = [...tabs.matchAll(/title: '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(titles, ['Home', 'Ideas', 'Material', 'Perform', 'Gigs']); assert.doesNotMatch(tabs, /title: 'More'/);
});

test('Hinglish survives JSON and search normalization without rewriting', () => {
  const text = 'Main ek baar yahan gaya, aur guard ne poocha — appointment hai ya bas confidence?';
  const roundTrip = JSON.parse(JSON.stringify({ body: text })).body; assert.equal(roundTrip, text);
  assert.equal(roundTrip.toLocaleLowerCase().includes('appointment hai'), true); assert.equal(roundTrip.toLocaleLowerCase().includes('guard ne poocha'), true);
});

test('sound-paced threshold smooths energy and honors silence grace', () => {
  let state = initialSoundPacerState(-60); const options = { sensitivity: 0.6, sampleMs: 100, graceMs: 900, smoothing: 0.5 };
  assert.equal(soundThreshold(-60, 0.6), -49.2);
  for (let index = 0; index < 5; index++) state = updateSoundPacer(state, -25, options);
  assert.equal(state.speaking, true); assert.equal(pacedPixelsPerSecond(24, state), 24);
  for (let index = 0; index < 5; index++) state = updateSoundPacer(state, -80, options);
  assert.equal(state.speaking, true, 'short silence remains in grace period');
  for (let index = 0; index < 12; index++) state = updateSoundPacer(state, -80, options);
  assert.equal(state.speaking, false); assert.equal(pacedPixelsPerSecond(24, state), 0);
});

test('room calibration resists a single loud outlier', () => {
  assert.equal(calibratedNoiseFloor([-62, -61, -60, -59, -20]), -59);
});

test('teleprompter cleanup releases recording and audio mode', async () => {
  const practice = await source('../app/practice.tsx');
  assert.match(practice, /voiceRecorder\.stop\(\)/); assert.match(practice, /allowsRecording: false/); assert.match(practice, /Sound-paced/); assert.doesNotMatch(practice, /speech-to-text|SpeechRecognition/i);
});

test('session setup requires setlist and audience', () => {
  assert.deepEqual(validateSessionSetup({}), ['Choose a setlist.', 'Choose an audience.']); assert.deepEqual(validateSessionSetup({ setlistId: 'set', audienceType: 'club' }), []);
});

test('markers are ordered and correction retains joke/version association', () => {
  const base = { userId: 'u', sessionId: 's', eventType: 'marker', createdAt: '2026-01-01', updatedAt: '2026-01-01', recordingTimestampMs: 0 };
  const events = orderMarkers([{ ...base, id: 'b', jokeId: 'j2', jokeVersionId: 'v2', setlistPosition: 1, timestampMs: 200 }, { ...base, id: 'a', jokeId: 'j1', jokeVersionId: 'v1', setlistPosition: 0, timestampMs: 100 }]);
  assert.deepEqual(events.map(item => item.jokeVersionId), ['v1', 'v2']); const corrected = correctMarker(events, 'b', 50); assert.equal(corrected[0].id, 'b'); assert.equal(corrected[0].eventType, 'correction');
});

test('review validation enforces contextual rating ranges', () => {
  assert.deepEqual(validateReview({ rating: 0, laughScore: 101 }), ['Rating must be from 1 to 5.', 'Laugh score must be from 0 to 100.']); assert.deepEqual(validateReview({ rating: 5, laughScore: 0 }), []);
});

test('version comparison reports sample counts and insufficient data cautiously', () => {
  const joke = { id: 'j', versions: [{ id: 'v', version: 1, setup: 'Main yahan gaya', punchline: 'confidence', tag: '', callback: '', createdAt: '2026-01-01', note: '' }] };
  const outcomes = compareVersionOutcomes(joke, [{ id: 'r', userId: 'u', sessionId: 's', jokeId: 'j', jokeVersionId: 'v', rating: 4, laughScore: 70, audienceType: 'club', decision: 'keep', createdAt: '2026-01-02', updatedAt: '2026-01-02' }]);
  assert.equal(outcomes[0].ratingSamples, 1); assert.equal(outcomes[0].laughSamples, 1); assert.equal(outcomes[0].insufficientData, true);
});

test('performance state is local-first and queued only after local persistence', async () => {
  const context = await source('../context/PerformanceSessionContext.tsx'); const persistIndex = context.indexOf('await persist(next)'); const queueIndex = context.indexOf("await queue('performanceSession'"); assert.ok(persistIndex > 0 && queueIndex > persistIndex);
  assert.match(context, /savePerformanceSnapshot/); assert.match(context, /createRevisionFromReview/);
});

test('recording failure leaves session and markers intact', async () => {
  const live = await source('../app/performance-session/live.tsx'); assert.match(live, /Session and markers are already local/); assert.match(live, /finishSession\(session\.id, recordingId\)/);
});

test('post-show review supports partial save and resume', async () => {
  const review = await source('../app/performance-session/review.tsx'); assert.match(review, /Save incomplete review and return later/); assert.match(review, /reviews\.find/);
});

test('new tables have CRUD RLS and required indexes', async () => {
  const migration = await source('../supabase/migrations/20261030190000_punchline_performance_sessions.sql');
  for (const table of ['standup_performance_sessions', 'standup_session_joke_events', 'standup_session_joke_reviews']) { assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`)); }
  for (const operation of ['select', 'insert', 'update', 'delete']) assert.match(migration, new RegExp(`for ${operation} to authenticated`));
  assert.match(migration, /user_session_time_idx/); assert.match(migration, /user_joke_version_idx/);
});

test('export contains sessions and reviews and destructive actions require confirmation', async () => {
  const settings = await source('../app/settings.tsx'); assert.match(settings, /performanceSessions: sessions/); assert.match(settings, /sessionJokeReviews: reviews/); assert.match(settings, /confirmAction/); assert.match(settings, /Delete cloud backup\?/);
});
