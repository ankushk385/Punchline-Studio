import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Android resizes content and hides tabs while typing', async () => {
  const [appConfig, tabs] = await Promise.all([
    read('app.json'),
    read('app/(tabs)/_layout.tsx'),
  ]);

  assert.equal(JSON.parse(appConfig).expo.android.softwareKeyboardLayoutMode, 'resize');
  assert.match(tabs, /tabBarHideOnKeyboard:\s*true/);
});

test('shared bottom sheet is a native, keyboard-aware, scrollable modal', async () => {
  const sheet = await read('components/KeyboardAwareBottomSheet.tsx');

  assert.match(sheet, /<Modal/);
  assert.match(sheet, /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(sheet, /<KeyboardAwareScrollViewCompat/);
  assert.match(sheet, /<KeyboardToolbar doneText="Done"/);
  assert.match(sheet, /maxHeight:\s*'94%'/);
});

test('all tab-screen forms use the shared native modal', async () => {
  const screens = await Promise.all([
    read('app/(tabs)/inbox.tsx'),
    read('app/(tabs)/setlist.tsx'),
    read('app/(tabs)/gigs.tsx'),
  ]);

  for (const source of screens) {
    assert.match(source, /<KeyboardAwareBottomSheet/);
  }

  assert.doesNotMatch(screens[0], /modalStyles\.overlay/);
  assert.doesNotMatch(screens[1], /modalStyles\.overlay/);
});

test('multi-field dialogs provide keyboard Next/Done behavior', async () => {
  const [inbox, gigs, setlist] = await Promise.all([
    read('app/(tabs)/inbox.tsx'),
    read('app/(tabs)/gigs.tsx'),
    read('app/(tabs)/setlist.tsx'),
  ]);

  assert.match(inbox, /returnKeyType="next"/);
  assert.match(inbox, /bodyInputRef\.current\?\.focus\(\)/);
  assert.match(gigs, /venueInputRef\.current\?\.focus\(\)/);
  assert.match(gigs, /notesInputRef\.current\?\.focus\(\)/);
  assert.match(setlist, /returnKeyType="done"/);
  assert.match(gigs, /submitBehavior="blurAndSubmit"/);
});

test('Home keeps the five-tab design while exposing Library and Crowd Logger', async () => {
  const [home, tabs] = await Promise.all([
    read('app/(tabs)/index.tsx'),
    read('app/(tabs)/_layout.tsx'),
  ]);

  assert.match(home, /label="Library"/);
  assert.match(home, /router\.push\('\/jokes'\)/);
  assert.match(home, /label="Crowd Logger"/);
  assert.match(home, /router\.push\('\/crowd-logger'\)/);
  assert.equal((tabs.match(/\{ name:\s*'/g) ?? []).length, 5);
  assert.match(tabs, /tabs\.map\(tab\s*=>/);
});

test('idea and joke editors provide expo-audio voice capture', async () => {
  const [inbox, jokeBuilder, packageJson] = await Promise.all([
    read('app/(tabs)/inbox.tsx'),
    read('app/joke-builder.tsx'),
    read('package.json'),
  ]);

  assert.match(inbox, /from 'expo-audio'/);
  assert.match(inbox, /Add voice note/);
  assert.match(inbox, /requestRecordingPermissionsAsync/);
  assert.match(inbox, /Remove voice note/);
  assert.match(inbox, /kind:\s*'idea-note'/);
  assert.match(inbox, /ideaId:\s*savedId/);
  assert.match(inbox, /voiceClip/);
  assert.match(inbox, /deleteRecording\(/);
  assert.match(jokeBuilder, /kind:\s*'voice-take'/);
  assert.match(jokeBuilder, /isBestTake:/);
  assert.match(jokeBuilder, /markBestTake/);
  assert.match(jokeBuilder, /updateRecording/);
  assert.equal(JSON.parse(packageJson).dependencies['expo-av'], undefined);
  assert.match(JSON.parse(packageJson).dependencies['expo-audio'], /^~1\.1\./);
});

test('teleprompter supports timed auto-scroll and microphone-paced voice follow', async () => {
  const practice = await read('app/practice.tsx');

  assert.match(practice, /TELE_SCROLL_SPEEDS/);
  assert.match(practice, />Auto scroll</);
  assert.match(practice, />Voice follow</);
  assert.match(practice, /isMeteringEnabled:\s*true/);
  assert.match(practice, /meter\s*>\s*-48/);
  assert.match(practice, /teleScroll\.current\?\.scrollTo/);
  assert.match(practice, /Microphone access needed/);
  assert.match(practice, /Voice follow unavailable/);
});

test('voice takes appear in Recordings and interface sounds respect preferences', async () => {
  const [recordings, data, theme, sounds] = await Promise.all([
    read('app/(tabs)/record.tsx'),
    read('context/DataContext.tsx'),
    read('theme/ThemeProvider.tsx'),
    read('lib/interface-sounds.ts'),
  ]);

  assert.match(data, /kind\?:\s*'performance'\s*\|\s*'voice-take'\s*\|\s*'idea-note'/);
  assert.match(data, /isBestTake\?:\s*boolean/);
  assert.match(recordings, /Joke take/);
  assert.match(recordings, /Best take/);
  assert.match(theme, /setInterfaceSoundsEnabled\(soundsEnabled\)/);
  assert.match(sounds, /createAudioPlayer/);
  assert.match(sounds, /if \(!enabled\) return/);
});

test('Settings separates cache clearing from permanent cloud deletion and exposes sync state', async () => {
  const settings = await read('app/settings.tsx');

  assert.match(settings, /title="Cloud sync"/);
  assert.match(settings, /Last synced/);
  assert.match(settings, /pendingCount/);
  assert.match(settings, /Sync now/);
  assert.match(settings, /Retry pending changes/);
  assert.match(settings, /Clear local cache/);
  assert.match(settings, /Cloud kept/);
  assert.match(settings, /Delete cloud backup/);
  assert.match(settings, /resetAllData/);
  assert.match(settings, /deleteCloudAccountData/);
  assert.match(settings, /Export all data \(JSON\)/);
  assert.match(settings, /Your cloud backup is not deleted/);
});

test('calendar linking stays device-local and never queues a cloud write', async () => {
  const data = await read('context/DataContext.tsx');
  const body = data.match(/const syncGigToCalendar = useCallback\(async \(id: string\) => \{[\s\S]*?await saveGigs\(updated\);\s*\}, \[([^\]]*)\]\);/);

  assert.ok(body, 'syncGigToCalendar implementation must exist');
  assert.doesNotMatch(body[0], /queueOperation/);
  assert.doesNotMatch(body[0], /updatedAt:/);
  assert.equal(body[1].replace(/\s/g, ''), 'commitGigs,saveGigs');
});

test('expo-audio hook recorders are not accessed after automatic native disposal', async () => {
  const sources = await Promise.all([
    read('app/(tabs)/inbox.tsx'),
    read('app/(tabs)/record.tsx'),
    read('app/joke-builder.tsx'),
    read('app/practice.tsx'),
  ]);

  for (const source of sources) {
    assert.doesNotMatch(source, /\.isRecording/);
    assert.doesNotMatch(source, /useEffect\(\(\) => \(\) => \{[^}]*\.stop\(\)/);
  }

  assert.match(sources[3], /voiceFollowActive\.current/);
});
