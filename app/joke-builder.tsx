import { Ionicons } from '@expo/vector-icons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PrimaryButton } from '@/components/ui/AppUI';
import { SegmentedControl } from '@/components/ui/Playbill';
import { CrowdType, JokeState, useData } from '@/context/DataContext';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppColors, radius, spacing, type } from '@/theme/tokens';
import { isSupabaseConfigured } from '@/lib/supabase';
import { playInterfaceSound } from '@/lib/interface-sounds';

const states: { value: JokeState; label: string }[] = [
  { value: 'draft', label: 'Draft' }, { value: 'developing', label: 'Developing' },
  { value: 'stage-ready', label: 'Stage Ready' }, { value: 'retired', label: 'Retired' },
];
const crowds: { value: CrowdType; label: string }[] = [
  { value: 'any', label: 'Any crowd' }, { value: 'club', label: 'Club' },
  { value: 'college', label: 'College' }, { value: 'corporate', label: 'Corporate' },
];

function stateColor(value: JokeState, colors: AppColors) {
  if (value === 'stage-ready') return colors.mint;
  if (value === 'developing') return colors.warning;
  if (value === 'retired') return colors.red;
  return colors.muted;
}

export default function JokeBuilderScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ jokeId?: string; fromIdea?: string; seedSetup?: string }>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { jokes, addJoke, updateJoke, saveJokeVersion, setlists, addJokeToSetlist, profile, recordings, addRecording, updateRecording, deleteRecording, uploadRecording, getRecordingPlaybackUri } = useData();
  const existing = params.jokeId ? jokes.find(joke => joke.id === params.jokeId) : undefined;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [setup, setSetup] = useState(existing?.setup ?? params.seedSetup ?? '');
  const [punchline, setPunchline] = useState(existing?.punchline ?? '');
  const [tag, setTag] = useState(existing?.tag ?? '');
  const [callback, setCallback] = useState(existing?.callback ?? '');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [tagText, setTagText] = useState('');
  const [jokeState, setJokeState] = useState<JokeState>(existing?.jokeState ?? 'draft');
  const [crowdType, setCrowdType] = useState<CrowdType>(existing?.crowdType ?? profile.crowdType ?? 'any');
  const [duration, setDuration] = useState(existing?.duration ?? 60);
  const [showMore, setShowMore] = useState(Boolean(existing?.tag || existing?.callback));
  const [showSetlists, setShowSetlists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [recordingTake, setRecordingTake] = useState(false);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const takeRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const takeRecorderState = useAudioRecorderState(takeRecorder, 150);
  const takePlayer = useAudioPlayer(null, { updateInterval: 150 });
  const takePlayerStatus = useAudioPlayerStatus(takePlayer);
  const savedId = useRef(existing?.id ?? null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const savingRef = useRef(false);
  const latest = useRef({ title, setup, punchline, tag, callback, tags, jokeState, crowdType, duration });
  latest.current = { title, setup, punchline, tag, callback, tags, jokeState, crowdType, duration };

  const save = useCallback(async (close = false, allowVoiceOnly = false) => {
    const data = latest.current;
    if (!data.setup.trim() && !data.punchline.trim() && !allowVoiceOnly) {
      if (!close) Alert.alert('Add your premise', 'Write a setup or punchline before saving.');
      return false;
    }
    if (savingRef.current) return false;
    savingRef.current = true; setSaving(true);
    try {
      const payload = {
        title: data.title.trim() || data.setup.trim().slice(0, 50) || 'Untitled joke',
        setup: data.setup.trim(), punchline: data.punchline.trim(), tag: data.tag.trim(), callback: data.callback.trim(),
        tags: data.tags, duration: data.duration, jokeState: data.jokeState,
        comedyStyle: existing?.comedyStyle ?? profile.comedyStyle, crowdType: data.crowdType, ideaId: params.fromIdea,
      };
      if (savedId.current) await updateJoke(savedId.current, payload);
      else { const created = await addJoke(payload); savedId.current = created.id; }
      dirty.current = false; setLastSaved(new Date());
      if (close) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); }
      return savedId.current;
    } catch { Alert.alert('Could not save', 'Your joke could not be saved. Please try again.'); return false; }
    finally { savingRef.current = false; setSaving(false); }
  }, [addJoke, existing?.comedyStyle, params.fromIdea, profile.comedyStyle, updateJoke]);
  const saveRef = useRef(save); saveRef.current = save;

  const takes = recordings.filter(item => item.jokeId === savedId.current && item.kind === 'voice-take');

  useEffect(() => {
    if (takePlayerStatus.didJustFinish) setActiveTakeId(null);
  }, [takePlayerStatus.didJustFinish]);
  useEffect(() => {
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (setup.trim() || punchline.trim()) saveTimer.current = setTimeout(() => { void saveRef.current(false); }, 2500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [title, setup, punchline, tag, callback, tags, jokeState, crowdType, duration]);

  useEffect(() => () => { if (dirty.current) void saveRef.current(false); }, []);
  useEffect(() => { if (setup.trim() && punchline.trim() && jokeState === 'draft') setJokeState('developing'); }, [jokeState, punchline, setup]);

  function addTopicTag() {
    const clean = tagText.trim();
    if (clean && !tags.includes(clean)) setTags(current => [...current, clean]);
    setTagText('');
  }

  async function openWizard() {
    if (!await saveRef.current(false) || !savedId.current) return;
    router.push({ pathname: '/bit-wizard', params: { jokeId: savedId.current } });
  }

  async function toggleTakeRecording() {
    if (recordingTake) {
      const durationMillis = takeRecorderState.durationMillis;
      try {
        await takeRecorder.stop();
        const uri = takeRecorder.uri;
        if (!uri || durationMillis < 500 || !savedId.current) return Alert.alert('Recording too short', 'Record for at least one second.');
        const saved = await addRecording({
          name: `Take ${takes.length + 1} · ${latest.current.title.trim() || 'Voice joke'}`,
          uri,
          duration: durationMillis,
          jokeId: savedId.current,
          kind: 'voice-take',
          isBestTake: takes.length === 0,
          mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4',
          notes: '',
          tags: ['voice-take'],
        });
        if (isSupabaseConfigured) void uploadRecording(saved.id).catch(() => {});
        playInterfaceSound('success');
      } catch { Alert.alert('Could not save take', 'The recording is still safe if it appears in Recordings.'); }
      finally { setRecordingTake(false); }
      return;
    }
    const jokeId = await saveRef.current(false, true);
    if (!jokeId) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return Alert.alert('Microphone access needed', 'Enable microphone access to record a voice take.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await takeRecorder.prepareToRecordAsync();
      takeRecorder.record();
      setRecordingTake(true);
      playInterfaceSound('tap');
    } catch { Alert.alert('Could not record', 'Check microphone access and try again.'); }
  }

  async function playTake(id: string) {
    const take = takes.find(item => item.id === id);
    if (!take) return;
    try {
      if (activeTakeId === id && takePlayerStatus.playing) { takePlayer.pause(); setActiveTakeId(null); return; }
      const uri = await getRecordingPlaybackUri(take);
      takePlayer.replace(uri);
      takePlayer.play();
      setActiveTakeId(id);
    } catch { Alert.alert('Could not play take', 'The audio file may no longer be available.'); }
  }

  async function markBestTake(id: string) {
    await Promise.all(takes.map(item => updateRecording(item.id, { isBestTake: item.id === id })));
    playInterfaceSound('success');
  }

  return (
    <View style={[styles.screen, { paddingTop: Platform.OS === 'web' ? 62 : insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close joke builder" disabled={recordingTake} onPress={() => { void saveRef.current(false); router.back(); }} style={[styles.iconButton, recordingTake && { opacity: 0.4 }]}><Ionicons name="chevron-back" size={23} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.heading}>JOKE STUDIO</Text><Text style={styles.subheading}>{lastSaved ? `Saved ${lastSaved.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : existing ? 'Edit without losing the original.' : 'Write. Refine. Get unstuck.'}</Text></View>
        <Pressable onPress={() => void saveRef.current(true)} disabled={saving || recordingTake} style={[styles.headerSave, recordingTake && { opacity: 0.4 }]}><Text style={styles.headerSaveText}>{recordingTake ? 'Recording' : saving ? 'Saving' : 'Save'}</Text></Pressable>
      </View>
      <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]}>
        <View style={styles.writeRail}><Text style={styles.writeNumber}>03</Text><View style={{ flex: 1 }}><Text style={styles.writeTitle}>WRITE</Text><Text style={styles.writeSub}>Build freely or get a guided prompt.</Text></View></View>
        <SegmentedControl value="builder" options={[{ value: 'builder', label: 'Builder' }, { value: 'guide', label: 'Guide me' }]} onChange={value => { if (value === 'guide') void openWizard(); }} />
        <View style={styles.fieldCard}>
          <View style={styles.fieldHead}><Ionicons name="bulb-outline" size={19} color={colors.amber} /><Text style={styles.fieldLabel}>Premise</Text><Text style={styles.counter}>{title.length}/100</Text></View>
          <TextInput value={title} onChangeText={setTitle} placeholder="What is this joke about?" placeholderTextColor={colors.subtle} style={styles.input} maxLength={100} testID="joke-title-input" />
        </View>
        <View style={styles.fieldCard}>
          <View style={styles.fieldHead}><Ionicons name="document-text-outline" size={19} color={colors.lavender} /><Text style={styles.fieldLabel}>Setup</Text><Text style={styles.counter}>{setup.length}/500</Text></View>
          <TextInput value={setup} onChangeText={setSetup} placeholder="Set the scene. What does the audience need to know?" placeholderTextColor={colors.subtle} style={[styles.input, styles.longInput]} multiline textAlignVertical="top" maxLength={500} testID="joke-setup-input" />
        </View>
        <View style={styles.fieldCard}>
          <View style={styles.fieldHead}><Ionicons name="sparkles-outline" size={19} color={colors.lavender} /><Text style={styles.fieldLabel}>Punchline</Text><Text style={styles.counter}>{punchline.length}/500</Text></View>
          <TextInput value={punchline} onChangeText={setPunchline} placeholder="Where does the expectation flip?" placeholderTextColor={colors.subtle} style={[styles.input, styles.longInput]} multiline textAlignVertical="top" maxLength={500} testID="joke-punchline-input" />
        </View>

        <Pressable onPress={() => setShowMore(value => !value)} style={styles.disclosure}><Text style={styles.disclosureText}>Tags, callback & delivery</Text><Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} /></Pressable>
        {showMore && <View style={styles.fieldCard}>
          <Text style={styles.smallLabel}>Follow-up tag</Text><TextInput value={tag} onChangeText={setTag} placeholder="One more laugh..." placeholderTextColor={colors.subtle} style={styles.input} />
          <Text style={styles.smallLabel}>Callback</Text><TextInput value={callback} onChangeText={setCallback} placeholder="Reference an earlier bit..." placeholderTextColor={colors.subtle} style={styles.input} />
          <Text style={styles.smallLabel}>Topic tags</Text>
          <View style={styles.tagInputRow}><TextInput value={tagText} onChangeText={setTagText} onSubmitEditing={addTopicTag} placeholder="Add a tag" placeholderTextColor={colors.subtle} style={[styles.input, { flex: 1 }]} /><Pressable onPress={addTopicTag} style={styles.addTag}><Ionicons name="add" size={20} color={colors.lavender} /></Pressable></View>
          {!!tags.length && <View style={styles.tags}>{tags.map(item => <Pressable key={item} onPress={() => setTags(current => current.filter(tagItem => tagItem !== item))} style={styles.tag}><Text style={styles.tagText}>{item}</Text><Ionicons name="close" size={12} color={colors.lavender} /></Pressable>)}</View>}
          <Text style={styles.smallLabel}>Best for</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{crowds.map(item => <Pressable key={item.value} onPress={() => setCrowdType(item.value)} style={[styles.chip, crowdType === item.value && styles.chipSelected]}><Text style={[styles.chipText, crowdType === item.value && styles.chipTextSelected]}>{item.label}</Text></Pressable>)}</ScrollView>
          <Text style={styles.smallLabel}>Estimated duration</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{[30, 60, 90, 120, 180, 300].map(value => <Pressable key={value} onPress={() => setDuration(value)} style={[styles.chip, duration === value && styles.chipSelected]}><Text style={[styles.chipText, duration === value && styles.chipTextSelected]}>{value < 60 ? `${value}s` : `${value / 60}m`}</Text></Pressable>)}</ScrollView>
        </View>}

        <View style={styles.fieldCard}><Text style={styles.smallLabel}>Joke status</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{states.map(item => { const color = stateColor(item.value, colors); const active = jokeState === item.value; return <Pressable key={item.value} onPress={() => setJokeState(item.value)} style={[styles.chip, active && { backgroundColor: `${color}1F`, borderColor: color }]}><Text style={[styles.chipText, active && { color }]}>{item.label}</Text></Pressable>; })}</ScrollView></View>

        <View style={styles.fieldCard}>
          <View style={styles.fieldHead}><Ionicons name="mic-outline" size={19} color={recordingTake ? colors.red : colors.lavender} /><Text style={styles.fieldLabel}>Voice takes</Text><Text style={styles.counter}>{takes.length}</Text></View>
          <Text style={styles.voiceHint}>Try different timing and delivery. Every take is also available in Recordings.</Text>
          <Pressable accessibilityLabel={recordingTake ? 'Stop voice take' : 'Record voice take'} onPress={() => void toggleTakeRecording()} style={[styles.recordTake, recordingTake && { backgroundColor: colors.redSoft, borderColor: colors.red }]}><Ionicons name={recordingTake ? 'stop-circle' : 'mic'} size={20} color={recordingTake ? colors.red : colors.lavender} /><Text style={[styles.recordTakeText, recordingTake && { color: colors.red }]}>{recordingTake ? `Stop · ${Math.floor(takeRecorderState.durationMillis / 1000)}s` : 'Record a new take'}</Text></Pressable>
          {takes.map((take, index) => <View key={take.id} style={styles.takeRow}>
            <Pressable accessibilityLabel={`${activeTakeId === take.id && takePlayerStatus.playing ? 'Pause' : 'Play'} ${take.name}`} onPress={() => void playTake(take.id)} style={styles.takePlay}><Ionicons name={activeTakeId === take.id && takePlayerStatus.playing ? 'pause' : 'play'} size={17} color={colors.onAccent} /></Pressable>
            <View style={{ flex: 1 }}><TextInput defaultValue={take.name} onEndEditing={event => void updateRecording(take.id, { name: event.nativeEvent.text.trim() || `Take ${index + 1}` })} style={styles.takeName} /><Text style={styles.takeMeta}>{Math.max(1, Math.round(take.duration / 1000))}s · {take.uploadStatus === 'synced' ? 'Backed up' : 'Saved locally'}</Text></View>
            <Pressable accessibilityLabel={take.isBestTake ? 'Best take' : 'Mark as best take'} onPress={() => void markBestTake(take.id)} style={[styles.takeIcon, take.isBestTake && { backgroundColor: colors.amberSoft }]}><Ionicons name={take.isBestTake ? 'star' : 'star-outline'} size={18} color={take.isBestTake ? colors.amber : colors.muted} /></Pressable>
            <Pressable accessibilityLabel="Delete voice take" onPress={() => Alert.alert('Delete this take?', 'This removes the audio from the joke and Recordings.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteRecording(take.id) }])} style={styles.takeIcon}><Ionicons name="trash-outline" size={17} color={colors.red} /></Pressable>
          </View>)}
        </View>

        <PrimaryButton label="Try Bit Wizard" icon="sparkles-outline" tone="lavender" onPress={() => void openWizard()} />
        {!!savedId.current && <View style={styles.secondaryRow}>
          <Pressable onPress={async () => { await saveRef.current(false); if (savedId.current) { await saveJokeVersion(savedId.current, 'Manual snapshot'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } }} style={styles.secondary}><Ionicons name="camera-outline" size={17} color={colors.muted} /><Text style={styles.secondaryText}>Snapshot</Text></Pressable>
          <Pressable onPress={() => savedId.current && router.push(`/joke-versions/${savedId.current}`)} style={styles.secondary}><Ionicons name="time-outline" size={17} color={colors.muted} /><Text style={styles.secondaryText}>History</Text></Pressable>
        </View>}
        {!!setlists.length && <View style={styles.fieldCard}><Pressable onPress={() => setShowSetlists(value => !value)} style={styles.disclosureInner}><Text style={styles.fieldLabel}>Add to a setlist</Text><Ionicons name={showSetlists ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} /></Pressable>{showSetlists && setlists.map(setlist => <Pressable key={setlist.id} onPress={async () => { if (!await saveRef.current(false) || !savedId.current) return; try { await addJokeToSetlist(setlist.id, savedId.current, duration); setShowSetlists(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { Alert.alert('Could not add', 'This joke may already be in the setlist or the set is too long.'); } }} style={styles.setlistRow}><Text style={styles.setlistName}>{setlist.name}</Text><Text style={styles.setlistMeta}>{setlist.jokes.length} jokes</Text></Pressable>)}</View>}
        <PrimaryButton label={recordingTake ? 'Stop recording to save' : existing ? 'Save changes' : 'Save joke'} icon="save-outline" onPress={() => void saveRef.current(true)} disabled={saving || recordingTake || (!setup.trim() && !punchline.trim())} />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function makeStyles(colors: AppColors) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: type.display, fontSize: 31, color: colors.text, letterSpacing: 0.3 },
  subheading: { fontFamily: type.regular, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  headerSave: { minHeight: 40, paddingHorizontal: 15, borderRadius: 12, justifyContent: 'center', backgroundColor: colors.amber },
  headerSaveText: { fontFamily: type.semibold, fontSize: 13, color: colors.onAccent },
  content: { paddingHorizontal: spacing.md, gap: 11 },
  writeRail: { minHeight: 54, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center' },
  writeNumber: { width: 58, textAlign: 'center', fontFamily: type.display, fontSize: 34, color: colors.black },
  writeTitle: { fontFamily: type.bold, fontSize: 14, color: colors.black, letterSpacing: 0.6 },
  writeSub: { fontFamily: type.regular, fontSize: 10.5, color: colors.black, marginTop: 1 },
  fieldCard: { backgroundColor: colors.card, borderWidth: 1.25, borderColor: colors.border, padding: 14, gap: 8 },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabel: { fontFamily: type.semibold, fontSize: 16, color: colors.text, flex: 1 },
  counter: { fontFamily: type.regular, fontSize: 11, color: colors.muted },
  input: { minHeight: 46, borderWidth: 1.25, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, fontFamily: type.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  longInput: { minHeight: 86, paddingTop: 11 },
  disclosure: { minHeight: 44, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  disclosureText: { fontFamily: type.semibold, fontSize: 14, color: colors.muted },
  disclosureInner: { minHeight: 36, flexDirection: 'row', alignItems: 'center' },
  smallLabel: { fontFamily: type.semibold, fontSize: 12.5, color: colors.text, marginTop: 5 },
  chips: { gap: 7 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipSelected: { borderColor: colors.lavender, backgroundColor: colors.lavenderSoft },
  chipText: { fontFamily: type.medium, fontSize: 12, color: colors.muted },
  chipTextSelected: { color: colors.lavender },
  tagInputRow: { flexDirection: 'row', gap: 8 },
  addTag: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.lavenderSoft, flexDirection: 'row', alignItems: 'center', gap: 4 },
  tagText: { fontFamily: type.medium, fontSize: 11.5, color: colors.lavender },
  secondaryRow: { flexDirection: 'row', gap: 8 },
  secondary: { flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryText: { fontFamily: type.medium, fontSize: 13, color: colors.muted },
  setlistRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: colors.border },
  setlistName: { flex: 1, fontFamily: type.medium, fontSize: 13.5, color: colors.text },
  setlistMeta: { fontFamily: type.regular, fontSize: 12, color: colors.muted },
  voiceHint: { fontFamily: type.regular, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  recordTake: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lavender, backgroundColor: colors.lavenderSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  recordTakeText: { fontFamily: type.semibold, fontSize: 13.5, color: colors.lavender },
  takeRow: { minHeight: 60, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  takePlay: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center' },
  takeName: { fontFamily: type.semibold, fontSize: 13, color: colors.text, padding: 0 },
  takeMeta: { fontFamily: type.regular, fontSize: 10.5, color: colors.muted, marginTop: 2 },
  takeIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
}); }
