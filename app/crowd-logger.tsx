import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useData, CrowdType } from '@/context/DataContext';
import { getLocalDateString } from '@/lib/date';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppColors, spacing, type } from '@/theme/tokens';
import { AppScreen } from '@/components/ui/Playbill';

const CROWD_TYPES: { value: CrowdType; label: string; emoji: string }[] = [
  { value: 'corporate', label: 'Corporate', emoji: '💼' },
  { value: 'college', label: 'College', emoji: '🎓' },
  { value: 'club', label: 'Club', emoji: '🎤' },
  { value: 'any', label: 'Mixed / Open', emoji: '🌐' },
];

const REACTION_OPTS = [
  { label: 'Killed', value: 10, icon: '💀' },
  { label: 'Big laugh', value: 9, icon: '🤣' },
  { label: 'Good', value: 7, icon: '😄' },
  { label: 'Polite', value: 5, icon: '😐' },
  { label: 'Silence', value: 2, icon: '😬' },
];

interface ShowEntry {
  jokeId: string;
  jokeTitle: string;
  reaction: number;
  reactionLabel: string;
}

export default function CrowdLoggerScreen() {
  const insets = useSafeAreaInsets();
  const { jokes, setlists, addRatings } = useData();
  const { colors } = useAppTheme();
  const styles = makeStyles(colors);
  const [step, setStep] = useState<'crowd' | 'jokes' | 'done'>('crowd');
  const [crowdType, setCrowdType] = useState<CrowdType>('any');
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ShowEntry[]>([]);
  const [jokeQueue, setJokeQueue] = useState<typeof jokes>([]);
  const [currentJokeIdx, setCurrentJokeIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const activeSetlistJokes = selectedSetlistId
    ? (setlists.find(s => s.id === selectedSetlistId)?.jokes.map(sj => jokes.find(j => j.id === sj.jokeId)).filter(Boolean) as typeof jokes)
    : jokes.filter(j => j.jokeState === 'stage-ready' || (j as any).jokeState === 'in-set');

  function startLogging() {
    const queue = activeSetlistJokes.slice(0, 20);
    setJokeQueue(queue);
    setCurrentJokeIdx(0);
    setStep('jokes');
  }

  function logReaction(reaction: number, reactionLabel: string) {
    const joke = jokeQueue[currentJokeIdx];
    if (!joke) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEntries(prev => [...prev, { jokeId: joke.id, jokeTitle: joke.title || joke.setup?.slice(0, 30) || 'Untitled', reaction, reactionLabel }]);
    if (currentJokeIdx + 1 >= jokeQueue.length) {
      setStep('done');
    } else {
      setCurrentJokeIdx(i => i + 1);
    }
  }

  function skipJoke() {
    if (currentJokeIdx + 1 >= jokeQueue.length) setStep('done');
    else setCurrentJokeIdx(i => i + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function saveAll() {
    if (isSaving) return;
    setIsSaving(true);
    const today = getLocalDateString();
    try {
      await addRatings(entries.map(entry => ({ jokeId: entry.jokeId, performanceDate: today, rating: entry.reaction, laughScore: entry.reaction, notes: '', crowdType, kept: entry.reaction >= 5 })));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      console.error('Could not save ratings:', error);
      Alert.alert('Could not save ratings', 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const currentJoke = jokeQueue[currentJokeIdx];

  if (step === 'done') {
    return (
      <AppScreen>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Close summary" onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Show Summary</Text>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}>
          <Animated.View entering={ZoomIn.duration(400)} style={styles.summaryHero}>
            <Text style={styles.summaryEmoji}>{entries.filter(e => e.reaction >= 8).length > entries.length / 2 ? '🎉' : '📊'}</Text>
            <Text style={styles.summaryTitle}>Set Complete!</Text>
            <Text style={styles.summarySub}>{entries.length} jokes logged</Text>
          </Animated.View>
          {entries.map((e, i) => (
            <Animated.View key={e.jokeId + i} entering={FadeInDown.delay(i * 60).duration(300)} style={styles.summaryCard}>
              <Text style={styles.summaryJokeTitle} numberOfLines={1}>{e.jokeTitle}</Text>
              <View style={styles.summaryReaction}>
                <Text style={styles.summaryEmojiBig}>{REACTION_OPTS.find(r => r.value === e.reaction)?.icon || '😐'}</Text>
                <Text style={styles.summaryLabel}>{e.reactionLabel}</Text>
              </View>
            </Animated.View>
          ))}
        </ScrollView>
        <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={styles.discardBtn} onPress={() => router.back()}><Text style={styles.discardText}>Discard</Text></Pressable>
          <Pressable style={styles.saveAllBtn} onPress={saveAll} disabled={isSaving}><Ionicons name="checkmark-circle" size={18} color={colors.white} /><Text style={styles.saveAllText}>{isSaving ? 'Saving...' : 'Save All Ratings'}</Text></Pressable>
        </View>
      </AppScreen>
    );
  }

  if (step === 'jokes' && currentJoke) {
    return (
      <AppScreen>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={() => setStep('crowd')} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Crowd Logger</Text>
            <Text style={styles.headerSub}>{currentJokeIdx + 1} of {jokeQueue.length}</Text>
          </View>
          <Pressable onPress={skipJoke}><Text style={styles.skipText}>Skip</Text></Pressable>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((currentJokeIdx + 1) / jokeQueue.length) * 100}%` }]} /></View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.jokeCard}>
            <Text style={styles.jokeKicker}>JOKE IN SET</Text>
            <Text style={styles.jokeTitle}>{currentJoke.title || 'Untitled'}</Text>
            {currentJoke.setup ? <Text style={styles.jokeSetup}>{currentJoke.setup}</Text> : null}
          </View>
          <Text style={styles.reactionTitle}>How&apos;d it land?</Text>
          <View style={styles.reactionGrid}>
            {REACTION_OPTS.map(opt => (
              <Pressable key={opt.value} style={styles.reactionBtn} onPress={() => logReaction(opt.value, opt.label)}>
                <Text style={styles.reactionIcon}>{opt.icon}</Text>
                <Text style={styles.reactionLabel}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close" onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Crowd Logger</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Select Audience</Text>
        <View style={styles.audienceGrid}>
          {CROWD_TYPES.map(type => (
            <Pressable key={type.value} style={[styles.audienceBtn, crowdType === type.value && styles.audienceBtnActive]} onPress={() => setCrowdType(type.value)}>
              <Text style={styles.audienceEmoji}>{type.emoji}</Text>
              <Text style={[styles.audienceLabel, crowdType === type.value && { color: colors.white }]}>{type.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Source</Text>
        <Pressable style={[styles.sourceBtn, !selectedSetlistId && styles.sourceBtnActive]} onPress={() => setSelectedSetlistId(null)}>
          <Ionicons name="library-outline" size={20} color={!selectedSetlistId ? colors.white : colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.sourceTitle, !selectedSetlistId && { color: colors.white }]}>All stage-ready jokes</Text>
            <Text style={[styles.sourceSub, !selectedSetlistId && { color: colors.white, opacity: 0.8 }]}>Log from your entire material</Text>
          </View>
        </Pressable>
        {setlists.length > 0 && <Pressable style={[styles.sourceBtn, selectedSetlistId && styles.sourceBtnActive]} onPress={() => setSelectedSetlistId(setlists[0].id)}>
          <Ionicons name="list-outline" size={20} color={selectedSetlistId ? colors.white : colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.sourceTitle, selectedSetlistId && { color: colors.white }]}>Current setlist</Text>
            <Text style={[styles.sourceSub, selectedSetlistId && { color: colors.white, opacity: 0.8 }]}>{setlists[0].name}</Text>
          </View>
        </Pressable>}
        <Pressable style={styles.startBtn} onPress={startLogging}>
          <Ionicons name="play" size={18} color={colors.white} />
          <Text style={styles.startBtnText}>Start Logging</Text>
        </Pressable>
      </ScrollView>
    </AppScreen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: type.bold, fontSize: 20, color: colors.text, flex: 1 },
    headerSub: { fontFamily: type.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
    skipText: { fontFamily: type.medium, fontSize: 14, color: colors.muted, paddingHorizontal: spacing.sm },
    progressTrack: { height: 4, backgroundColor: colors.surface, marginHorizontal: spacing.md },
    progressFill: { height: '100%', backgroundColor: colors.blue },
    scroll: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, gap: spacing.md },
    sectionTitle: { fontFamily: type.bold, fontSize: 16, color: colors.text },
    audienceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    audienceBtn: { flexBasis: '48%', flexGrow: 1, borderWidth: 1.25, borderColor: colors.border, padding: spacing.md, alignItems: 'center', gap: spacing.xs },
    audienceBtnActive: { backgroundColor: colors.blue, borderColor: colors.blue },
    audienceEmoji: { fontSize: 28 },
    audienceLabel: { fontFamily: type.medium, fontSize: 13, color: colors.text },
    sourceBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1.25, borderColor: colors.border, padding: spacing.md },
    sourceBtnActive: { backgroundColor: colors.blue, borderColor: colors.blue },
    sourceTitle: { fontFamily: type.medium, fontSize: 14, color: colors.text },
    sourceSub: { fontFamily: type.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
    startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.blue, padding: spacing.md, marginTop: spacing.lg },
    startBtnText: { fontFamily: type.bold, fontSize: 15, color: colors.white },
    jokeCard: { borderWidth: 1.25, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
    jokeKicker: { fontFamily: type.bold, fontSize: 10, color: colors.gold, letterSpacing: 0.7 },
    jokeTitle: { fontFamily: type.bold, fontSize: 22, color: colors.text },
    jokeSetup: { fontFamily: type.regular, fontSize: 15, color: colors.muted, lineHeight: 22 },
    reactionTitle: { fontFamily: type.bold, fontSize: 16, color: colors.text, textAlign: 'center', marginTop: spacing.md },
    reactionGrid: { gap: spacing.xs },
    reactionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1.25, borderColor: colors.border, padding: spacing.md },
    reactionIcon: { fontSize: 24 },
    reactionLabel: { fontFamily: type.medium, fontSize: 15, color: colors.text },
    summaryHero: { alignItems: 'center', padding: spacing.xl, gap: spacing.xs },
    summaryEmoji: { fontSize: 48 },
    summaryTitle: { fontFamily: type.bold, fontSize: 28, color: colors.text },
    summarySub: { fontFamily: type.regular, fontSize: 14, color: colors.muted },
    summaryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.25, borderColor: colors.border, padding: spacing.md },
    summaryJokeTitle: { fontFamily: type.medium, fontSize: 14, color: colors.text, flex: 1 },
    summaryReaction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    summaryEmojiBig: { fontSize: 20 },
    summaryLabel: { fontFamily: type.medium, fontSize: 13, color: colors.text },
    bottomActions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md, borderTopWidth: 1.25, borderTopColor: colors.border },
    discardBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md, borderWidth: 1.5, borderColor: colors.border },
    discardText: { fontFamily: type.bold, fontSize: 15, color: colors.text },
    saveAllBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.blue, padding: spacing.md },
    saveAllText: { fontFamily: type.bold, fontSize: 15, color: colors.white },
  });
}
