import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

const CLOUD_TABLES = [
  'standup_ideas',
  'standup_jokes',
  'standup_setlists',
  'standup_gigs',
  'standup_ratings',
  'standup_daily_progress',
  'standup_user_settings',
  'standup_recordings',
  'standup_recording_tombstones',
];

test('recording migration keeps audio private and owner-scoped', async () => {
  const sql = await read('supabase/migrations/20261027090000_standup_recordings.sql');
  assert.match(sql, /'standup-recordings',[\s\S]*false/);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /storage\.foldername\(name\)/);
  assert.doesNotMatch(sql, /service[_-]role/i);
});

test('cloud sync migration is newer and covers every account-owned table', async () => {
  assert.ok('20261029120000_standup_cloud_sync.sql' > '20261027090000_standup_recordings.sql');
  const sql = await read('supabase/migrations/20261029120000_standup_cloud_sync.sql');

  for (const table of CLOUD_TABLES) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table}\\s+enable row level security`, 'i'),
      `${table} must enable row level security`,
    );
  }

  assert.match(sql, /create table if not exists public\.standup_daily_progress[\s\S]*?unique \(user_id, local_date\)/i);
  assert.match(sql, /create table if not exists public\.standup_user_settings[\s\S]*?user_id uuid primary key/i);
  assert.match(sql, /create table if not exists public\.standup_recording_tombstones[\s\S]*?primary key \(user_id, recording_id\)/i);
  assert.doesNotMatch(sql, /service[_-]role/i);
});

test('RLS policies only allow authenticated users to touch their own rows', async () => {
  const sql = await read('supabase/migrations/20261029120000_standup_cloud_sync.sql');

  assert.match(sql, /for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /for insert to authenticated with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /for update to authenticated using \(\(select auth\.uid\(\)\) = user_id\) with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /for delete to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.ok((sql.match(/auth\.uid\(\)/g) ?? []).length >= 15);
});

test('recording storage stays private and paths remain user-scoped', async () => {
  const sql = await read('supabase/migrations/20261029120000_standup_cloud_sync.sql');

  assert.match(sql, /'standup-recordings',\s*'standup-recordings',\s*false,/i);
  assert.match(sql, /bucket_id = 'standup-recordings'/);
  assert.match(sql, /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  assert.match(sql, /for select[\s\S]*?storage\.objects/i);
  assert.match(sql, /for insert[\s\S]*?storage\.objects/i);
  assert.match(sql, /for update[\s\S]*?storage\.objects/i);
  assert.match(sql, /for delete[\s\S]*?storage\.objects/i);
});

test('recording metadata preserves voice-take, idea-note and best-take fields', async () => {
  const sql = await read('supabase/migrations/20261029120000_standup_cloud_sync.sql');
  const storage = await read('lib/recording-storage.ts');

  for (const column of ['idea_id', 'kind', 'is_best_take', 'notes', 'tags', 'deleted_at']) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`), `missing ${column}`);
  }

  for (const field of ['joke_id', 'idea_id', 'setlist_id', 'kind', 'is_best_take', 'notes', 'tags', 'created_at', 'updated_at']) {
    assert.match(storage, new RegExp(`${field}:`), `upload metadata missing ${field}`);
  }
  assert.match(storage, /session\.user\.id \+ '\/' \+ recording\.id \+ '\.' \+ extension/);
  assert.match(storage, /createSignedUrl\(storagePath, 60 \* 60\)/);
  assert.match(storage, /standup_recording_tombstones[\s\S]*?upsert/);
  assert.match(storage, /standup_recordings'\)[\s\S]*?\.delete\(\)/);
});

test('speech recording profile uses the current expo-audio preset', async () => {
  const screen = await read('app/(tabs)/record.tsx');
  assert.match(screen, /RecordingPresets\.HIGH_QUALITY/);
  assert.match(screen, /isMeteringEnabled:\s*true/);
  assert.match(screen, /kind:\s*'performance'/);
  assert.match(screen, /mimeType: Platform\.OS === 'web' \? 'audio\/webm' : 'audio\/mp4'/);
  assert.match(screen, /uploadRecording\(saved\.id\)/);
  assert.doesNotMatch(screen, /AndroidAudioEncoder\.AAC/);
});

test('the mobile client never references a service-role credential', async () => {
  const sources = await Promise.all([
    read('lib/supabase.ts'),
    read('lib/cloud-data.ts'),
    read('lib/data-sync.ts'),
    read('lib/recording-storage.ts'),
    read('context/DataContext.tsx'),
  ]);

  for (const source of sources) {
    assert.doesNotMatch(source, /service[_-]?role/i);
    assert.doesNotMatch(source, /SUPABASE_SERVICE/i);
  }
});

test('calendar and APK configuration are enabled', async () => {
  const appConfig = JSON.parse(await read('app.json'));
  const easConfig = JSON.parse(await read('eas.json'));
  assert.ok(appConfig.expo.plugins.some(plugin => Array.isArray(plugin) && plugin[0] === 'expo-calendar'));
  assert.equal(easConfig.build.preview.android.buildType, 'apk');
});
