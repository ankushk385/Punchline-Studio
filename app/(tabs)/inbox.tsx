import { Feather, Ionicons } from '@expo/vector-icons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareBottomSheet } from '@/components/KeyboardAwareBottomSheet';
import { EmptyState, PrimaryButton } from '@/components/ui/AppUI';
import { FilterChip, PlaybillHeader } from '@/components/ui/Playbill';
import { ComedyStyle, Idea, IdeaStatus, useData } from '@/context/DataContext';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppColors, radius, spacing, type } from '@/theme/tokens';

const statusLabels: Record<IdeaStatus, string> = { raw: 'Raw', developing: 'Developing', 'stage-ready': 'Stage Ready', archived: 'Archived' };
const comedyStyles: { value: ComedyStyle; label: string }[] = [
  { value: 'observational', label: 'Observational' }, { value: 'dark', label: 'Dark' },
  { value: 'storytelling', label: 'Storytelling' }, { value: 'roast', label: 'Roast' },
  { value: 'self-deprecating', label: 'Self-deprecating' }, { value: 'absurdist', label: 'Absurdist' },
];

function statusColor(status: IdeaStatus, colors: AppColors) {
  if (status === 'raw') return colors.red;
  if (status === 'developing') return colors.warning;
  if (status === 'stage-ready') return colors.mint;
  return colors.muted;
}

function IdeaEditor({ idea, onClose }: { idea?: Idea; onClose: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeEditorStyles(colors), [colors]);
  const { addIdea, updateIdea, deleteIdea, recordings, addRecording, deleteRecording, getRecordingPlaybackUri } = useData();
  const [title, setTitle] = useState(idea?.title ?? '');
  const [body, setBody] = useState(idea?.body ?? '');
  const [status, setStatus] = useState<IdeaStatus>(idea?.status ?? 'raw');
  const [comedyStyle, setComedyStyle] = useState<ComedyStyle | undefined>(idea?.comedyStyle);
  const [tags, setTags] = useState<string[]>(idea?.tags ?? []);
  const [tagText, setTagText] = useState('');
  const [legacyClip] = useState<string | undefined>(idea?.voiceClip);
  const [removeLegacyClip, setRemoveLegacyClip] = useState(false);
  const [pendingClip, setPendingClip] = useState<{ uri: string; duration: number } | null>(null);
  const [removedRecordingId, setRemovedRecordingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(audioRecorder, 200);
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const playerStatus = useAudioPlayerStatus(player);
  const bodyInputRef = useRef<TextInput>(null);

  const linkedRecording = useMemo(() => recordings
    .filter(item => item.kind === 'idea-note' && item.ideaId === idea?.id)
    .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())[0], [idea?.id, recordings]);
  const activeLinkedRecording = linkedRecording && linkedRecording.id !== removedRecordingId ? linkedRecording : undefined;
  const effectiveLegacyClip = removeLegacyClip ? undefined : legacyClip;
  const hasClip = Boolean(pendingClip || activeLinkedRecording || effectiveLegacyClip);

  async function toggleRecording() {
    if (recording) {
      const duration = recorderState.durationMillis;
      try {
        await audioRecorder.stop();
        const uri = audioRecorder.uri;
        setRecording(false);
        if (!uri) return;
        setPendingClip({ uri, duration });
      } catch {
        setRecording(false);
        Alert.alert('Recording error', 'The voice note could not be saved.');
      }
      return;
    }
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return Alert.alert('Microphone access needed', 'Enable microphone access to capture voice notes.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecording(true);
    } catch { Alert.alert('Could not record', 'Check microphone access and try again.'); }
  }

  async function playClip() {
    try {
      if (playerStatus.playing) {
        player.pause();
        return;
      }
      let uri = pendingClip?.uri ?? effectiveLegacyClip;
      if (!uri && activeLinkedRecording) uri = await getRecordingPlaybackUri(activeLinkedRecording);
      if (!uri) return;
      player.replace(uri);
      player.play();
    } catch { Alert.alert('Could not play', 'This voice note may no longer be available.'); }
  }

  function removeClip() {
    player.pause();
    if (pendingClip) {
      // Removing the newly recorded clip reveals any earlier saved note again.
      setPendingClip(null);
      return;
    }
    if (activeLinkedRecording) {
      setRemovedRecordingId(activeLinkedRecording.id);
      return;
    }
    if (effectiveLegacyClip) setRemoveLegacyClip(true);
  }

  function addTag() {
    const clean = tagText.trim();
    if (clean && !tags.includes(clean)) setTags(current => [...current, clean]);
    setTagText('');
  }

  async function save() {
    if (!title.trim() && !body.trim()) return Alert.alert('Add an idea', 'Write a title or a quick note first.');
    const keepLegacyClip = pendingClip || activeLinkedRecording || removeLegacyClip ? undefined : legacyClip;
    const payload = { title: title.trim() || body.trim().slice(0, 50), body: body.trim(), status, tags, comedyStyle, voiceClip: keepLegacyClip };

    let savedId: string;
    if (idea) {
      await updateIdea(idea.id, payload);
      savedId = idea.id;
    } else {
      const saved = await addIdea(payload);
      savedId = saved.id;
    }

    if (pendingClip) {
      if (activeLinkedRecording) await deleteRecording(activeLinkedRecording.id);
      await addRecording({
        name: `Idea note · ${payload.title || 'Untitled idea'}`,
        uri: pendingClip.uri,
        duration: pendingClip.duration,
        kind: 'idea-note',
        ideaId: savedId,
        mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4',
        notes: '',
        tags: ['idea-note'],
      });
    } else if (removedRecordingId) {
      await deleteRecording(removedRecordingId);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  }

  function confirmDelete() {
    if (!idea) return;
    Alert.alert('Delete idea?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteIdea(idea.id); onClose(); } },
    ]);
  }

  return (
    <KeyboardAwareBottomSheet onClose={onClose} accessibilityLabel="Close idea editor" testID="idea-editor-sheet">
      <View style={styles.editorHeader}>
        <View><Text style={styles.editorTitle}>{idea ? 'Edit idea' : 'Capture an idea'}</Text><Text style={styles.editorSub}>Save the spark. Shape it later.</Text></View>
        {idea && <Pressable accessibilityLabel="Delete idea" onPress={confirmDelete} hitSlop={10}><Feather name="trash-2" size={20} color={colors.red} /></Pressable>}
      </View>
      <View style={styles.voiceRow}>
          <Pressable onPress={toggleRecording} style={[styles.voiceButton, recording && { borderColor: colors.red, backgroundColor: colors.redSoft }]}>
            <Ionicons name={recording ? 'stop-circle' : 'mic-outline'} size={18} color={recording ? colors.red : colors.lavender} />
            <Text style={[styles.voiceText, recording && { color: colors.red }]}>{recording ? `Stop · ${Math.floor(recorderState.durationMillis / 1000)}s` : hasClip ? 'Record again' : 'Add voice note'}</Text>
          </Pressable>
          {hasClip && !recording && <><Pressable accessibilityLabel="Play voice note" onPress={playClip} style={styles.voicePlay}><Ionicons name={playerStatus.playing ? 'pause' : 'play'} size={17} color={colors.lavender} /></Pressable><Pressable accessibilityLabel="Remove voice note" onPress={removeClip} style={styles.voicePlay}><Ionicons name="trash-outline" size={17} color={colors.red} /></Pressable></>}
        </View>
      <Text style={styles.label}>Title</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="A short premise" placeholderTextColor={colors.subtle} style={styles.input} autoFocus={!idea} returnKeyType="next" onSubmitEditing={() => bodyInputRef.current?.focus()} testID="idea-title-input" />
      <Text style={styles.label}>Notes</Text>
      <TextInput ref={bodyInputRef} value={body} onChangeText={setBody} placeholder="What made this funny?" placeholderTextColor={colors.subtle} style={[styles.input, styles.notes]} multiline textAlignVertical="top" testID="idea-body-input" />
      <Text style={styles.label}>Status</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {(['raw', 'developing', 'stage-ready', 'archived'] as IdeaStatus[]).map(item => {
          const color = statusColor(item, colors); const active = status === item;
          return <Pressable key={item} onPress={() => setStatus(item)} style={[styles.chip, active && { backgroundColor: `${color}20`, borderColor: color }]}><Text style={[styles.chipText, active && { color }]}>{statusLabels[item]}</Text></Pressable>;
        })}
      </ScrollView>
      <Text style={styles.label}>Comedy style</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {comedyStyles.map(item => <Pressable key={item.value} onPress={() => setComedyStyle(comedyStyle === item.value ? undefined : item.value)} style={[styles.chip, comedyStyle === item.value && { backgroundColor: colors.lavenderSoft, borderColor: colors.lavender }]}><Text style={[styles.chipText, comedyStyle === item.value && { color: colors.lavender }]}>{item.label}</Text></Pressable>)}
      </ScrollView>
      <Text style={styles.label}>Tags</Text>
      <View style={styles.tagInputRow}><TextInput value={tagText} onChangeText={setTagText} onSubmitEditing={addTag} placeholder="Add a tag" placeholderTextColor={colors.subtle} style={[styles.input, { flex: 1, marginBottom: 0 }]} /><Pressable onPress={addTag} style={styles.addTag}><Ionicons name="add" size={20} color={colors.lavender} /></Pressable></View>
      {!!tags.length && <View style={styles.tags}>{tags.map(tag => <Pressable key={tag} onPress={() => setTags(current => current.filter(item => item !== tag))} style={styles.tag}><Text style={styles.tagText}>{tag}</Text><Ionicons name="close" size={12} color={colors.muted} /></Pressable>)}</View>}
      <PrimaryButton label={recording ? 'Stop recording to save' : idea ? 'Save changes' : 'Save idea'} icon="save-outline" onPress={save} disabled={recording} style={{ marginTop: 18 }} />
    </KeyboardAwareBottomSheet>
  );
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ capture?: string }>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { ideas } = useData();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<IdeaStatus | 'all'>('all');
  const [editing, setEditing] = useState<Idea | null>(null);
  const [adding, setAdding] = useState(false);
  const openedFromParam = useRef(false);

  useEffect(() => {
    if (params.capture === '1' && !openedFromParam.current) { openedFromParam.current = true; setAdding(true); }
  }, [params.capture]);

  const filtered = useMemo(() => ideas
    .filter(idea => filter === 'all' ? idea.status !== 'archived' : idea.status === filter)
    .filter(idea => !search.trim() || `${idea.title} ${idea.body} ${idea.tags.join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [filter, ideas, search]);

  return (
    <View style={[styles.screen, { paddingTop: Platform.OS === 'web' ? 62 : insets.top }]}>
      <PlaybillHeader number="02" title="Ideas" subtitle={`${ideas.filter(i => i.status !== 'archived').length} sparks waiting to become material.`} />
      <View style={styles.captureRail}><Text style={styles.captureNumber}>02</Text><View style={{ flex: 1 }}><Text style={styles.captureTitle}>CAPTURE ANYWHERE.</Text><Text style={styles.captureSub}>Save it before it disappears.</Text></View></View>
      <View style={styles.captureActions}><Pressable accessibilityLabel="Capture text idea" onPress={() => setAdding(true)} style={styles.capturePrimary}><Ionicons name="create-outline" size={18} color={colors.white} /><Text style={styles.capturePrimaryText}>TEXT IDEA</Text></Pressable><Pressable accessibilityLabel="Capture voice idea" onPress={() => setAdding(true)} style={styles.captureSecondary}><Ionicons name="mic-outline" size={18} color={colors.red} /><Text style={styles.captureSecondaryText}>VOICE NOTE</Text></Pressable></View>
      <View style={styles.search}><Feather name="search" size={18} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search ideas..." placeholderTextColor={colors.subtle} style={styles.searchInput} />{!!search && <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable>}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.filters}>
        {(['all', 'raw', 'developing', 'stage-ready'] as const).map(item => {
          const active = filter === item;
          return <FilterChip key={item} label={item === 'all' ? 'All' : statusLabels[item]} selected={active} onPress={() => setFilter(item)} />;
        })}
      </ScrollView>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: 98 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const color = statusColor(item.status, colors);
          return (
            <Pressable onPress={() => setEditing(item)} style={({ pressed }) => [styles.idea, { borderLeftColor: color, opacity: pressed ? 0.72 : 1 }]}>
              <View style={styles.ideaTop}><View style={[styles.badge, { backgroundColor: `${color}18` }]}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={[styles.badgeText, { color }]}>{statusLabels[item.status]}</Text></View><Text style={styles.date}>{new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text></View>
              <Text style={styles.ideaTitle} numberOfLines={1}>{item.title}</Text>
              {!!item.body && <Text style={styles.ideaBody} numberOfLines={2}>{item.body}</Text>}
              {!!item.tags.length && <View style={styles.tags}>{item.tags.slice(0, 4).map(tag => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View>}
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyState icon="bulb-outline" title={search ? 'No matching ideas' : 'Your inbox is ready'} body={search ? 'Try a different search or filter.' : 'Capture a thought before it disappears. You can shape it into a joke later.'} />}
      />
      {adding && <IdeaEditor onClose={() => setAdding(false)} />}
      {editing && <IdeaEditor idea={editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

function makeStyles(colors: AppColors) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  captureRail: { margin: spacing.md, marginBottom: 8, minHeight: 54, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.red },
  captureNumber: { width: 56, textAlign: 'center', fontFamily: type.display, fontSize: 32, color: colors.black },
  captureTitle: { fontFamily: type.bold, fontSize: 13, color: colors.white, letterSpacing: 0.5 },
  captureSub: { fontFamily: type.regular, fontSize: 10.5, color: colors.white, marginTop: 2 },
  captureActions: { paddingHorizontal: spacing.md, flexDirection: 'row', gap: 8, marginBottom: 12 },
  capturePrimary: { flex: 1, minHeight: 46, backgroundColor: colors.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  capturePrimaryText: { fontFamily: type.bold, fontSize: 11, color: colors.white, letterSpacing: 0.5 },
  captureSecondary: { flex: 1, minHeight: 46, borderWidth: 1.25, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  captureSecondaryText: { fontFamily: type.bold, fontSize: 11, color: colors.text, letterSpacing: 0.5 },
  search: { marginHorizontal: spacing.md, minHeight: 48, borderWidth: 1.25, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontFamily: type.regular, fontSize: 14, color: colors.text, paddingVertical: 0 },
  filters: { paddingHorizontal: spacing.md, paddingVertical: 10, gap: 7 },
  list: { paddingHorizontal: spacing.md, gap: 9 },
  idea: { backgroundColor: colors.card, borderWidth: 1.25, borderLeftWidth: 7, borderColor: colors.border, padding: 14 },
  ideaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontFamily: type.medium, fontSize: 11.5 },
  date: { fontFamily: type.regular, fontSize: 11.5, color: colors.muted },
  ideaTitle: { fontFamily: type.bold, fontSize: 16, color: colors.text },
  ideaBody: { fontFamily: type.regular, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tagText: { fontFamily: type.medium, fontSize: 11, color: colors.text },
}); }

function makeEditorStyles(colors: AppColors) { return StyleSheet.create({
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  editorTitle: { fontFamily: type.display, fontSize: 30, color: colors.text },
  editorSub: { fontFamily: type.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
  label: { fontFamily: type.semibold, fontSize: 12.5, color: colors.text, marginBottom: 7, marginTop: 12 },
  input: { minHeight: 48, borderWidth: 1.25, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 13, fontFamily: type.regular, fontSize: 14, color: colors.text },
  notes: { minHeight: 92, paddingTop: 12 },
  chipRow: { gap: 8, paddingBottom: 2 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipText: { fontFamily: type.medium, fontSize: 12, color: colors.muted },
  tagInputRow: { flexDirection: 'row', gap: 8 },
  addTag: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.lavenderSoft },
  tagText: { fontFamily: type.medium, fontSize: 11.5, color: colors.lavender },
  voiceRow: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  voiceButton: { minHeight: 44, flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  voiceText: { fontFamily: type.medium, fontSize: 13, color: colors.text },
  voicePlay: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
}); }
