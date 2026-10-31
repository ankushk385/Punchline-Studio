import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen, EmptyState, PlaybillCard, PlaybillHeader, StatusBadge } from '@/components/ui/Playbill';
import { JokeVersion, useData } from '@/context/DataContext';
import { usePerformanceSessions } from '@/context/PerformanceSessionContext';
import { compareVersionOutcomes, VersionOutcome } from '@/domain/performance';
import { confirmAction, notify } from '@/lib/dialog';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppColors, spacing, type } from '@/theme/tokens';

export default function JokeVersionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]); const { jokes, revertJokeVersion, updateJoke } = useData(); const { reviews } = usePerformanceSessions(); const joke = jokes.find(item => item.id === id);
  const outcomes = useMemo(() => joke ? compareVersionOutcomes(joke, reviews).sort((a, b) => b.version.version - a.version.version) : [], [joke, reviews]);
  if (!joke) return <AppScreen><PlaybillHeader back title="Version History" /><EmptyState title="Joke not found" body="This joke may have been removed on another device." /></AppScreen>;
  async function restore(version: JokeVersion) { const confirmed = await confirmAction({ title: `Restore v${version.version}?`, message: 'The current text is saved as a snapshot first. Performance history remains linked to its original version.', confirmLabel: 'Restore version' }); if (!confirmed) return; await revertJokeVersion(joke!.id, version.id); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
  async function duplicate(version: JokeVersion) { await updateJoke(joke!.id, { setup: version.setup, punchline: version.punchline, tag: version.tag, callback: version.callback }); notify('Editable copy created', 'The selected snapshot is now loaded as the current draft. Save Version when ready.'); router.back(); }
  return <AppScreen><PlaybillHeader back title="Version History" subtitle={`${joke.title} · observed outcomes, not causation`} number="03" />
    <FlatList data={outcomes} keyExtractor={item => item.version.id} contentContainerStyle={styles.list} ListHeaderComponent={<PlaybillCard accent="gold"><Text style={styles.caution}>Small samples are noisy. Punchline Studio reports performances, manual ratings, laugh scores, audiences, and venues without claiming that a text change caused the outcome.</Text></PlaybillCard>} ListEmptyComponent={<EmptyState title="No snapshots yet" body="Use Save Version in Joke Studio to preserve exact wording." />} renderItem={({ item, index }) => <VersionCard outcome={item} current={index === 0} onRestore={() => void restore(item.version)} onDuplicate={() => void duplicate(item.version)} />} />
  </AppScreen>;
}

function VersionCard({ outcome, current, onRestore, onDuplicate }: { outcome: VersionOutcome; current: boolean; onRestore: () => void; onDuplicate: () => void }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]); const { version } = outcome;
  return <PlaybillCard accent={current ? 'blue' : undefined} style={{ gap: 12 }}>
    <View style={styles.row}><Text style={styles.version}>VERSION {String(version.version).padStart(2, '0')}</Text>{current && <StatusBadge label="Current" tone="blue" />}<Text style={styles.date}>{new Date(version.createdAt).toLocaleDateString()}</Text></View>
    {version.note ? <Text style={styles.note}>{version.note}</Text> : null}
    {[['Setup', version.setup], ['Punchline', version.punchline], ['Tag', version.tag], ['Callback', version.callback]].filter(([, value]) => value).map(([label, value]) => <View key={label}><Text style={styles.label}>{label}</Text><Text selectable style={styles.copy}>{value}</Text></View>)}
    <View style={styles.metrics}><Metric value={String(outcome.performances)} label="Performances" /><Metric value={outcome.ratingAverage === null ? '—' : `${outcome.ratingAverage.toFixed(1)}/5`} label={`${outcome.ratingSamples} ratings`} /><Metric value={outcome.laughAverage === null ? '—' : `${Math.round(outcome.laughAverage)}/100`} label={`${outcome.laughSamples} laugh scores`} /></View>
    <Text style={styles.context}>{outcome.audiences.length ? `Audiences: ${outcome.audiences.join(', ')}` : 'No audience context yet.'}</Text>{outcome.recentNotes.map((note, index) => <Text key={`${note}-${index}`} style={styles.context}>“{note}”</Text>)}
    {outcome.insufficientData && <StatusBadge label="Insufficient data" tone="gold" />}
    <View style={styles.actions}>{!current && <Pressable onPress={onRestore} style={styles.action}><Ionicons name="arrow-undo" size={17} color={colors.blue} /><Text style={styles.actionText}>Restore</Text></Pressable>}<Pressable onPress={onDuplicate} style={styles.action}><Ionicons name="copy-outline" size={17} color={colors.blue} /><Text style={styles.actionText}>Duplicate to edit</Text></Pressable></View>
  </PlaybillCard>;
}
function Metric({ value, label }: { value: string; label: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]); return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
const makeStyles = (colors: AppColors) => StyleSheet.create({ list: { padding: spacing.lg, gap: 11, paddingBottom: 40 }, caution: { fontFamily: type.regular, fontSize: 12, lineHeight: 18, color: colors.muted }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, version: { fontFamily: type.display, fontSize: 24, color: colors.text }, date: { flex: 1, textAlign: 'right', fontFamily: type.regular, fontSize: 11, color: colors.muted }, note: { fontFamily: type.regular, fontSize: 12, fontStyle: 'italic', color: colors.muted }, label: { fontFamily: type.bold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase', color: colors.blue }, copy: { fontFamily: type.regular, fontSize: 14, lineHeight: 20, color: colors.text, marginTop: 3 }, metrics: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }, metric: { flex: 1, paddingVertical: 9, alignItems: 'center' }, metricValue: { fontFamily: type.bold, fontVariant: ['tabular-nums'], fontSize: 15, color: colors.text }, metricLabel: { fontFamily: type.regular, fontSize: 9.5, color: colors.muted, marginTop: 2 }, context: { fontFamily: type.regular, fontSize: 11, lineHeight: 16, color: colors.muted }, actions: { flexDirection: 'row', gap: 8 }, action: { minHeight: 44, flex: 1, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, actionText: { fontFamily: type.bold, fontSize: 11, color: colors.blue } });
