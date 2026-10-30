import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareBottomSheet } from '@/components/KeyboardAwareBottomSheet';
import { EmptyState, PrimaryButton, ScreenTitle } from '@/components/ui/AppUI';
import { CrowdType, Setlist, useData } from '@/context/DataContext';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppColors, radius, spacing, type } from '@/theme/tokens';

const crowds: { value: CrowdType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'any', label: 'Any', icon: 'people-outline' }, { value: 'club', label: 'Club', icon: 'mic-outline' },
  { value: 'corporate', label: 'Corporate', icon: 'briefcase-outline' }, { value: 'college', label: 'College', icon: 'school-outline' },
];
const durations = [30, 60, 90, 120, 150, 180, 240, 300];
const formatDuration = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const totalDuration = (setlist: Setlist) => setlist.jokes.reduce((sum, joke) => sum + joke.duration, 0);

function SetlistForm({ onClose }: { onClose: () => void }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeSheetStyles(colors), [colors]);
  const { addSetlist } = useData(); const [name, setName] = useState(''); const [crowd, setCrowd] = useState<CrowdType>('any');
  async function create() {
    if (!name.trim()) return Alert.alert('Name your setlist', 'Add a name before creating it.');
    await addSetlist(name.trim(), crowd); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onClose();
  }
  return <KeyboardAwareBottomSheet onClose={onClose} accessibilityLabel="Close setlist form" testID="new-setlist-sheet">
    <Text style={styles.title}>Create setlist</Text><Text style={styles.subtitle}>Build a running order for a specific room.</Text>
    <Text style={styles.label}>Name</Text><TextInput autoFocus value={name} onChangeText={setName} onSubmitEditing={create} returnKeyType="done" placeholder="Friday open mic" placeholderTextColor={colors.subtle} style={styles.input} testID="setlist-name-input" />
    <Text style={styles.label}>Crowd type</Text><View style={styles.crowdGrid}>{crowds.map(item => <Pressable key={item.value} onPress={() => setCrowd(item.value)} style={[styles.crowdChoice, crowd === item.value && styles.crowdSelected]}><Ionicons name={item.icon} size={18} color={crowd === item.value ? colors.amber : colors.muted} /><Text style={[styles.crowdChoiceText, crowd === item.value && { color: colors.amber }]}>{item.label}</Text></Pressable>)}</View>
    <PrimaryButton label="Create setlist" icon="add" onPress={() => void create()} style={{ marginTop: 18 }} />
  </KeyboardAwareBottomSheet>;
}

function AddJokeSheet({ setlist, onClose }: { setlist: Setlist; onClose: () => void }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeSheetStyles(colors), [colors]);
  const { jokes, addJokeToSetlist } = useData(); const [selected, setSelected] = useState<string | null>(null); const [duration, setDuration] = useState(60);
  const existing = new Set(setlist.jokes.map(item => item.jokeId)); const available = jokes.filter(joke => !existing.has(joke.id));
  async function add() { if (!selected) return Alert.alert('Choose a joke'); try { await addJokeToSetlist(setlist.id, selected, duration); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onClose(); } catch { Alert.alert('Could not add joke', 'The set may have reached its time limit.'); } }
  return <KeyboardAwareBottomSheet onClose={onClose} accessibilityLabel="Close add joke sheet" testID="add-joke-sheet">
    <Text style={styles.title}>Add a joke</Text><Text style={styles.subtitle}>Choose material, then set its stage time.</Text>
    {available.map(joke => <Pressable key={joke.id} onPress={() => setSelected(joke.id)} style={[styles.jokeChoice, selected === joke.id && styles.jokeSelected]}><Ionicons name={selected === joke.id ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected === joke.id ? colors.amber : colors.muted} /><View style={{ flex: 1 }}><Text style={styles.jokeChoiceTitle}>{joke.title}</Text><Text style={styles.jokeChoiceBody} numberOfLines={1}>{joke.setup || 'No setup yet'}</Text></View></Pressable>)}
    {!available.length && <Text style={styles.emptyText}>Every joke is already in this setlist.</Text>}
    {!!available.length && <><Text style={styles.label}>Stage time</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{durations.map(value => <Pressable key={value} onPress={() => setDuration(value)} style={[styles.duration, duration === value && styles.durationSelected]}><Text style={[styles.durationText, duration === value && { color: colors.amber }]}>{formatDuration(value)}</Text></Pressable>)}</ScrollView><PrimaryButton label="Add to setlist" icon="add" onPress={() => void add()} style={{ marginTop: 18 }} /></>}
  </KeyboardAwareBottomSheet>;
}

function SetlistDetail({ setlist, onBack }: { setlist: Setlist; onBack: () => void }) {
  const insets = useSafeAreaInsets(); const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  const { jokes, updateSetlist, removeJokeFromSetlist, reorderSetlistJokes, deleteSetlist, duplicateSetlist, activeSetlistId, setActiveSetlistId } = useData();
  const [adding, setAdding] = useState(false); const total = totalDuration(setlist);
  const items = setlist.jokes.map(item => ({ ...item, joke: jokes.find(joke => joke.id === item.jokeId) })).filter(item => item.joke);
  function move(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= setlist.jokes.length) return; const next = [...setlist.jokes]; [next[index], next[target]] = [next[target], next[index]]; void reorderSetlistJokes(setlist.id, next); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
  function remove(jokeId: string) { Alert.alert('Remove joke?', 'This keeps the joke in your library.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void removeJokeFromSetlist(setlist.id, jokeId) }]); }
  function removeSetlist() { Alert.alert('Delete setlist?', 'Your jokes will stay in the library.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteSetlist(setlist.id); onBack(); } }]); }
  return <View style={[styles.screen, { paddingTop: Platform.OS === 'web' ? 62 : insets.top }]}>
    <View style={styles.detailHeader}><Pressable onPress={onBack} style={styles.iconButton}><Ionicons name="chevron-back" size={23} color={colors.text} /></Pressable><View style={{ flex: 1 }}><Text style={styles.detailTitle} numberOfLines={1}>{setlist.name}</Text><Text style={styles.detailMeta}>{items.length} jokes · {formatDuration(total)}</Text></View><Pressable accessibilityLabel="Duplicate setlist" onPress={() => void duplicateSetlist(setlist.id)} style={styles.iconButton}><Ionicons name="copy-outline" size={19} color={colors.muted} /></Pressable><Pressable accessibilityLabel="Delete setlist" onPress={removeSetlist} style={styles.iconButton}><Feather name="trash-2" size={19} color={colors.red} /></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{crowds.map(item => <Pressable key={item.value} onPress={() => void updateSetlist(setlist.id, { crowdType: item.value })} style={[styles.filter, setlist.crowdType === item.value && styles.filterActive]}><Text style={[styles.filterText, setlist.crowdType === item.value && styles.filterTextActive]}>{item.label}</Text></Pressable>)}</ScrollView>
    <FlatList data={items} keyExtractor={item => item.jokeId} contentContainerStyle={[styles.detailList, { paddingBottom: 176 + insets.bottom }]} renderItem={({ item, index }) => <View style={styles.jokeCard}><View style={styles.drag}><Ionicons name="reorder-three-outline" size={20} color={colors.muted} /></View><View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View><Pressable onPress={() => item.joke && router.push({ pathname: '/joke-builder', params: { jokeId: item.joke.id } })} style={{ flex: 1 }}><Text style={styles.jokeTitle} numberOfLines={1}>{item.joke?.title}</Text><Text style={styles.jokeSetup} numberOfLines={1}>{item.joke?.setup || 'No setup'}</Text></Pressable><Text style={styles.jokeTime}>{formatDuration(item.duration)}</Text><View><Pressable accessibilityLabel="Move joke up" onPress={() => move(index, -1)} hitSlop={7}><Ionicons name="chevron-up" size={18} color={index ? colors.muted : colors.border} /></Pressable><Pressable accessibilityLabel="Move joke down" onPress={() => move(index, 1)} hitSlop={7}><Ionicons name="chevron-down" size={18} color={index < items.length - 1 ? colors.muted : colors.border} /></Pressable></View><Pressable accessibilityLabel="Remove joke" onPress={() => remove(item.jokeId)} hitSlop={8}><Ionicons name="close-circle-outline" size={19} color={colors.muted} /></Pressable></View>} ListEmptyComponent={<EmptyState icon="list-outline" title="This set is empty" body="Add jokes from your library, then arrange their running order." />} />
    <View style={[styles.bottomActions, { paddingBottom: 88 + Math.max(insets.bottom, 12), backgroundColor: colors.background }]}><Pressable onPress={() => setAdding(true)} style={styles.addJoke}><Ionicons name="add" size={20} color={colors.text} /><Text style={styles.addJokeText}>Add joke</Text></Pressable><PrimaryButton label="Practice set" icon="play" onPress={() => items.length ? router.push({ pathname: '/practice', params: { setlistId: setlist.id } }) : Alert.alert('Add a joke first')} style={{ flex: 1.6 }} /></View>
    <Pressable onPress={() => setActiveSetlistId(activeSetlistId === setlist.id ? null : setlist.id)} style={[styles.activePill, activeSetlistId === setlist.id && { backgroundColor: colors.mintSoft, borderColor: colors.mint }]}><Ionicons name={activeSetlistId === setlist.id ? 'star' : 'star-outline'} size={15} color={activeSetlistId === setlist.id ? colors.mint : colors.muted} /><Text style={[styles.activeText, activeSetlistId === setlist.id && { color: colors.mint }]}>{activeSetlistId === setlist.id ? 'Active set' : 'Make active'}</Text></Pressable>
    {adding && <AddJokeSheet setlist={setlist} onClose={() => setAdding(false)} />}
  </View>;
}

export default function SetlistScreen() {
  const insets = useSafeAreaInsets(); const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  const { setlists, duplicateSetlist } = useData(); const [filter, setFilter] = useState<CrowdType | 'all'>('all'); const [selectedId, setSelectedId] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  const selected = setlists.find(item => item.id === selectedId); if (selected) return <SetlistDetail setlist={selected} onBack={() => setSelectedId(null)} />;
  const filtered = filter === 'all' ? setlists : setlists.filter(item => item.crowdType === filter);
  return <View style={[styles.screen, { paddingTop: Platform.OS === 'web' ? 62 : insets.top }]}>
    <ScreenTitle title="My Setlists" subtitle="Organize your material for any crowd." action={<Pressable onPress={() => setCreating(true)} style={styles.newButton}><Ionicons name="add" size={20} color={colors.onAccent} /><Text style={styles.newButtonText}>New</Text></Pressable>} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{(['all', 'club', 'corporate', 'college'] as const).map(value => <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value === 'all' ? 'All' : crowds.find(item => item.value === value)?.label}</Text></Pressable>)}</ScrollView>
    <FlatList data={filtered} keyExtractor={item => item.id} contentContainerStyle={[styles.list, { paddingBottom: 98 + insets.bottom }]} showsVerticalScrollIndicator={false} renderItem={({ item }) => { const crowd = crowds.find(value => value.value === item.crowdType) ?? crowds[0]; const total = totalDuration(item); return <Pressable onPress={() => setSelectedId(item.id)} onLongPress={() => Alert.alert(item.name, 'Setlist options', [{ text: 'Duplicate', onPress: () => void duplicateSetlist(item.id) }, { text: 'Cancel', style: 'cancel' }])} style={({ pressed }) => [styles.setCard, { opacity: pressed ? 0.82 : 1 }]}><View style={[styles.setIcon, { backgroundColor: colors.lavenderSoft }]}><Ionicons name={crowd.icon} size={23} color={colors.lavender} /></View><View style={{ flex: 1 }}><Text style={styles.setName}>{item.name}</Text><Text style={styles.setMeta}>{crowd.label} · {item.jokes.length} joke{item.jokes.length === 1 ? '' : 's'} · {formatDuration(total)}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable>; }} ListEmptyComponent={<EmptyState icon="list-outline" title="Build your first set" body="Group jokes for an open mic, club, college, or corporate room." />} />
    {creating && <SetlistForm onClose={() => setCreating(false)} />}
  </View>;
}

function makeStyles(colors: AppColors) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  newButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.amber, flexDirection: 'row', alignItems: 'center', gap: 4 },
  newButtonText: { fontFamily: type.semibold, fontSize: 13, color: colors.onAccent },
  filters: { flexGrow: 0, paddingHorizontal: spacing.lg, paddingBottom: 14, gap: 8 },
  filter: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 15, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  filterActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  filterText: { fontFamily: type.medium, fontSize: 12.5, color: colors.muted }, filterTextActive: { color: colors.onAccent },
  list: { paddingHorizontal: spacing.lg, gap: 10 },
  setCard: { minHeight: 80, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 12 },
  setIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  setName: { fontFamily: type.semibold, fontSize: 16, color: colors.text }, setMeta: { fontFamily: type.regular, fontSize: 12.5, color: colors.muted, marginTop: 4 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 4 }, iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { fontFamily: type.bold, fontSize: 23, color: colors.text }, detailMeta: { fontFamily: type.regular, fontSize: 12.5, color: colors.muted, marginTop: 2 },
  detailList: { paddingHorizontal: spacing.lg, gap: 8 },
  jokeCard: { minHeight: 72, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 8 },
  drag: { width: 20 }, number: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, numberText: { fontFamily: type.bold, fontSize: 13, color: colors.text },
  jokeTitle: { fontFamily: type.semibold, fontSize: 14, color: colors.text }, jokeSetup: { fontFamily: type.regular, fontSize: 11.5, color: colors.muted, marginTop: 2 }, jokeTime: { fontFamily: type.medium, fontSize: 11.5, color: colors.lavender },
  bottomActions: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: 12, flexDirection: 'row', gap: 9, borderTopWidth: 1, borderTopColor: colors.border },
  addJoke: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, addJokeText: { fontFamily: type.semibold, fontSize: 14, color: colors.text },
  activePill: { position: 'absolute', right: 20, bottom: 150, minHeight: 38, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 }, activeText: { fontFamily: type.medium, fontSize: 12, color: colors.muted },
}); }
function makeSheetStyles(colors: AppColors) { return StyleSheet.create({
  title: { fontFamily: type.bold, fontSize: 23, color: colors.text }, subtitle: { fontFamily: type.regular, fontSize: 13.5, color: colors.muted, marginTop: 3, marginBottom: 10 }, label: { fontFamily: type.semibold, fontSize: 12.5, color: colors.text, marginTop: 12, marginBottom: 7 },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 13, fontFamily: type.regular, fontSize: 14, color: colors.text }, crowdGrid: { flexDirection: 'row', gap: 7 },
  crowdChoice: { flex: 1, minHeight: 65, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 5 }, crowdSelected: { borderColor: colors.amber, backgroundColor: colors.amberSoft }, crowdChoiceText: { fontFamily: type.medium, fontSize: 10.5, color: colors.muted },
  jokeChoice: { minHeight: 62, marginTop: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, jokeSelected: { borderColor: colors.amber, backgroundColor: colors.amberSoft }, jokeChoiceTitle: { fontFamily: type.semibold, fontSize: 13.5, color: colors.text }, jokeChoiceBody: { fontFamily: type.regular, fontSize: 11.5, color: colors.muted, marginTop: 2 },
  duration: { minHeight: 38, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' }, durationSelected: { borderColor: colors.amber, backgroundColor: colors.amberSoft }, durationText: { fontFamily: type.medium, fontSize: 12, color: colors.muted }, emptyText: { fontFamily: type.regular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 30 },
}); }
