import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Platform, FlatList,
} from 'react-native';
import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useData, CrowdType } from '@/context/DataContext';
import { getLocalDateString } from '@/lib/date';

const CROWD_TYPES: { value: CrowdType; label: string; emoji: string }[] = [
  { value: 'corporate', label: 'Corporate', emoji: '💼' },
  { value: 'college', label: 'College', emoji: '🎓' },
  { value: 'club', label: 'Club', emoji: '🎤' },
  { value: 'any', label: 'Mixed / Open', emoji: '🌐' },
];

const REACTION_OPTS = [
  { label: 'Killed', value: 10, icon: '💀', color: Colors.statusStage },
  { label: 'Big laugh', value: 9, icon: '🤣', color: Colors.statusStage },
  { label: 'Good', value: 7, icon: '😄', color: Colors.primaryGold },
  { label: 'Polite', value: 5, icon: '😐', color: Colors.statusDev },
  { label: 'Silence', value: 2, icon: '😬', color: Colors.statusRaw },
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
  const [step, setStep] = useState<'crowd' | 'jokes' | 'done'>('crowd');
  const [crowdType, setCrowdType] = useState<CrowdType>('any');
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ShowEntry[]>([]);
  const [jokeQueue, setJokeQueue] = useState<typeof jokes>([]);
  const [currentJokeIdx, setCurrentJokeIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const activeSetlistJokes = selectedSetlistId
    ? setlists.find(s => s.id === selectedSetlistId)?.jokes
        .map(sj => jokes.find(j => j.id === sj.jokeId))
        .filter(Boolean) as typeof jokes
    : jokes.filter(j => j.jokeState === 'stage-ready' || j.jokeState === 'in-set');

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
    setEntries(prev => [...prev, {
      jokeId: joke.id,
      jokeTitle: joke.title || joke.setup?.slice(0, 30) || 'Untitled',
      reaction,
      reactionLabel,
    }]);
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
      await addRatings(entries.map(entry => ({
        jokeId: entry.jokeId,
        performanceDate: today,
        rating: entry.reaction,
        laughScore: entry.reaction,
        notes: '',
        crowdType,
        kept: entry.reaction >= 5,
      })));
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
  const pct = jokeQueue.length > 0 ? (currentJokeIdx / jokeQueue.length) : 0;

  if (step === 'done') {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Close summary" onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={24} color={Colors.textGray} />
          </Pressable>
          <Text style={styles.headerTitle}>Show Summary</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}>
          <Animated.View entering={ZoomIn.duration(400)} style={styles.summaryHero}>
            <Text style={styles.summaryEmoji}>
              {entries.filter(e => e.reaction >= 8).length > entries.length / 2 ? '🎉' : '📊'}
            </Text>
            <Text style={styles.summaryTitle}>Set Complete!</Text>
            <Text style={styles.summarySub}>{entries.length} jokes logged</Text>
          </Animated.View>

          {entries.map((e, i) => (
            <Animated.View key={e.jokeId} entering={FadeInDown.delay(i * 60).duration(300)} style={styles.summaryCard}>
              <Text style={styles.summaryJokeTitle} numberOfLines={1}>{e.jokeTitle}</Text>
              <View style={styles.summaryReaction}>
                <Text style={styles.summaryEmojiBig}>
                  {REACTION_OPTS.find(r => r.value === e.reaction)?.icon || '😐'}
                </Text>
                <Text style={[styles.summaryLabel, {
                  color: REACTION_OPTS.find(r => r.value === e.reaction)?.color || Colors.textGray,
                }]}>{e.reactionLabel}</Text>
              </View>
            </Animated.View>
          ))}
        </ScrollView>
        <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={styles.discardBtn} onPress={() => router.back()}>
            <Text style={styles.discardText}>Discard</Text>
          </Pressable>
          <Pressable style={styles.saveAllBtn} onPress={saveAll} disabled={isSaving}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.oledBlack} />
            <Text style={styles.saveAllText}>{isSaving ? 'Saving...' : 'Save All Ratings'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === 'jokes' && currentJoke) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to crowd selection" onPress={() => setStep('crowd')} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={Colors.textGray} />
          </Pressable>
          <Text style={styles.headerTitle}>Crowd Logger</Text>
          <Text style={styles.progressText}>{currentJokeIdx + 1}/{jokeQueue.length}</Text>
        </View>

        {/* Progress */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct * 100}%` as unknown as number }]} />
        </View>

        <View style={styles.logContent}>
          <Animated.View key={currentJokeIdx} entering={FadeIn.duration(250)} style={styles.jokeCard}>
            <Text style={styles.jokeCurrent}>How did this land?</Text>
            <Text style={styles.jokeTitle}>{currentJoke.title}</Text>
            {currentJoke.setup && (
              <Text style={styles.jokeSetup} numberOfLines={3}>{currentJoke.setup}</Text>
            )}
          </Animated.View>

          <View style={styles.reactionGrid}>
            {REACTION_OPTS.map(opt => (
              <Pressable
                key={opt.value}
                style={({ pressed }) => [styles.reactionBtn, pressed && { transform: [{ scale: 0.92 }] }]}
                onPress={() => logReaction(opt.value, opt.label)}
              >
                <Text style={styles.reactionEmoji}>{opt.icon}</Text>
                <Text style={[styles.reactionLabel, { color: opt.color }]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.skipBtn} onPress={skipJoke}>
            <Ionicons name="arrow-forward" size={16} color={Colors.textMuted} />
            <Text style={styles.skipText}>Skip this joke</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Step: crowd selection
  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close crowd logger" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={Colors.textGray} />
        </Pressable>
        <Text style={styles.headerTitle}>Crowd Logger</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}>
        <Text style={styles.stepLabel}>What&apos;s the crowd?</Text>
        <View style={styles.crowdGrid}>
          {CROWD_TYPES.map(c => (
            <Pressable
              key={c.value}
              style={[styles.crowdCard, crowdType === c.value && { backgroundColor: Colors.primaryGold + '22', borderColor: Colors.primaryGold }]}
              onPress={() => setCrowdType(c.value)}
            >
              <Text style={styles.crowdEmoji}>{c.emoji}</Text>
              <Text style={[styles.crowdLabel, crowdType === c.value && { color: Colors.primaryGold }]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.stepLabel, { marginTop: 24 }]}>Logging from</Text>
        <View style={styles.setlistPicker}>
          <Pressable
            style={[styles.setlistOpt, !selectedSetlistId && { backgroundColor: Colors.primaryGold + '22', borderColor: Colors.primaryGold }]}
            onPress={() => setSelectedSetlistId(null)}
          >
            <Text style={[styles.setlistOptText, !selectedSetlistId && { color: Colors.primaryGold }]}>All Stage-Ready Jokes</Text>
          </Pressable>
          {setlists.map(s => (
            <Pressable
              key={s.id}
              style={[styles.setlistOpt, selectedSetlistId === s.id && { backgroundColor: Colors.primaryGold + '22', borderColor: Colors.primaryGold }]}
              onPress={() => setSelectedSetlistId(s.id)}
            >
              <Text style={[styles.setlistOptText, selectedSetlistId === s.id && { color: Colors.primaryGold }]}>{s.name}</Text>
              <Text style={styles.setlistMeta}>{s.jokes.length} jokes</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.startBtn, activeSetlistJokes.length === 0 && { opacity: 0.4 }]}
          onPress={startLogging}
          disabled={activeSetlistJokes.length === 0}
        >
          <Ionicons name="play" size={18} color={Colors.oledBlack} />
          <Text style={styles.startBtnText}>Start Logging ({activeSetlistJokes.length} jokes)</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.oledBlack },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.white },
  progressText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textGray },
  progressTrack: { height: 3, backgroundColor: Colors.cardDarker, marginHorizontal: 20, borderRadius: 2, marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: Colors.primaryGold, borderRadius: 2 },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },
  stepLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.white, marginBottom: 14 },
  crowdGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  crowdCard: {
    width: '47%', backgroundColor: Colors.cardDark, borderRadius: 16,
    padding: 20, alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  crowdEmoji: { fontSize: 28 },
  crowdLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.textGray, textAlign: 'center' },
  setlistPicker: { gap: 10 },
  setlistOpt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.cardDark, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  setlistOptText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textGray },
  setlistMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted },
  logContent: { flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 20 },
  jokeCard: {
    backgroundColor: Colors.cardDark, borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  jokeCurrent: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textMuted },
  jokeTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.primaryGold },
  jokeSetup: { fontFamily: 'Inter_400Regular', fontSize: 16, color: Colors.white, lineHeight: 26 },
  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  reactionBtn: {
    width: '18%', alignItems: 'center', gap: 6,
    backgroundColor: Colors.cardDark, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  reactionEmoji: { fontSize: 28 },
  reactionLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, textAlign: 'center' },
  skipBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  skipText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textMuted },
  bottomActions: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.oledBlack,
  },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primaryGold, borderRadius: 16, paddingVertical: 16,
  },
  startBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.oledBlack },
  discardBtn: {
    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: Colors.cardDark, borderWidth: 1, borderColor: Colors.border, marginBottom: 10,
  },
  discardText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.textGray },
  saveAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primaryGold, borderRadius: 14, paddingVertical: 15,
  },
  saveAllText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.oledBlack },
  summaryHero: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  summaryEmoji: { fontSize: 56 },
  summaryTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.white },
  summarySub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textGray },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.cardDark, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  summaryJokeTitle: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.white },
  summaryReaction: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryEmojiBig: { fontSize: 22 },
  summaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
