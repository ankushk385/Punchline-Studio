import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppCard, PrimaryButton } from '@/components/ui/AppUI';
import { useData } from '@/context/DataContext';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing, type } from '@/theme/tokens';
import { playInterfaceSound } from '@/lib/interface-sounds';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function Progress({ value, max, color }: { value: number; max: number; color: string }) {
  const { colors } = useAppTheme();
  const pct = Math.min(value / Math.max(max, 1), 1);
  return <View style={[styles.track, { backgroundColor: colors.surface }]}><View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} /></View>;
}

function QuickAction({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={() => { playInterfaceSound('tap'); onPress(); }} style={({ pressed }) => [styles.quick, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.78 : 1 }]}>
      <View style={[styles.quickIcon, { backgroundColor: `${color}1F` }]}><Ionicons name={icon} size={21} color={color} /></View>
      <Text style={[styles.quickLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { userName, todayPrompt, ideas, jokes, setlists, gigs, goals, todayProgress, ratings } = useData();

  const nextGig = useMemo(() => gigs
    .filter(gig => new Date(gig.startsAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0], [gigs]);
  const ready = jokes.filter(joke => joke.jokeState === 'stage-ready').length;
  const hot = jokes.filter(joke => {
    const jokeRatings = ratings.filter(rating => rating.jokeId === joke.id);
    return jokeRatings.length > 0 && jokeRatings.reduce((sum, rating) => sum + rating.laughScore, 0) / jokeRatings.length >= 8;
  }).length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 62 : insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: 104 + insets.bottom }]}>
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.muted }]}>{greeting()},</Text>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{userName || 'Comedian'}</Text>
            <Text style={[styles.tagline, { color: colors.muted }]}>Your next laugh starts here.</Text>
          </View>
          <Pressable accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={[styles.settings, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="settings" size={21} color={colors.muted} />
          </Pressable>
        </View>

        <AppCard style={[styles.prompt, { backgroundColor: colors.lavenderSoft, borderColor: `${colors.lavender}45` }]}>
          <View style={[styles.promptIcon, { backgroundColor: `${colors.lavender}25` }]}><Ionicons name="create-outline" size={23} color={colors.lavender} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.promptLabel, { color: colors.lavender }]}>TODAY&apos;S WRITING PROMPT</Text>
            <Text style={[styles.promptText, { color: colors.text }]} numberOfLines={2}>{todayPrompt}</Text>
          </View>
          <Pressable onPress={() => router.push({ pathname: '/joke-builder', params: { seedSetup: todayPrompt } })} style={[styles.write, { backgroundColor: colors.lavender }]}>
            <Text style={styles.writeText}>Write</Text>
          </Pressable>
        </AppCard>

        <PrimaryButton label="Capture an idea" icon="add" onPress={() => router.push({ pathname: '/(tabs)/inbox', params: { capture: '1' } })} />

        <View style={styles.dualRow}>
          <Pressable onPress={() => router.push('/(tabs)/inbox')} style={{ flex: 1 }}>
            <AppCard style={[styles.compactCard, { backgroundColor: colors.amberSoft }]}>
              <View style={[styles.compactIcon, { backgroundColor: `${colors.amber}28` }]}><Ionicons name="mail-outline" size={20} color={colors.warning} /></View>
              <Text style={[styles.compactTitle, { color: colors.text }]}>Idea Inbox</Text>
              <Text style={[styles.compactMeta, { color: colors.muted }]}>{ideas.filter(i => i.status !== 'archived').length} active</Text>
            </AppCard>
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/gigs')} style={{ flex: 1 }}>
            <AppCard style={[styles.compactCard, { backgroundColor: colors.mintSoft }]}>
              <View style={[styles.compactIcon, { backgroundColor: `${colors.mint}20` }]}><Ionicons name="calendar-outline" size={20} color={colors.mint} /></View>
              <Text style={[styles.compactTitle, { color: colors.text }]}>{nextGig ? 'Next gig' : 'Plan a gig'}</Text>
              <Text style={[styles.compactMeta, { color: colors.muted }]} numberOfLines={1}>{nextGig ? new Date(nextGig.startsAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Nothing scheduled'}</Text>
            </AppCard>
          </Pressable>
        </View>

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Today&apos;s goal</Text>
          <Pressable onPress={() => router.push('/settings')}><Text style={[styles.edit, { color: colors.lavender }]}>Edit</Text></Pressable>
        </View>
        <AppCard style={styles.goalCard}>
          <View style={styles.goalRow}>
            <Ionicons name="pencil-outline" size={19} color={colors.lavender} />
            <Text style={[styles.goalLabel, { color: colors.text }]}>Jokes</Text>
            <Progress value={todayProgress.jokesWritten} max={goals.dailyWriteTarget} color={colors.lavender} />
            <Text style={[styles.goalValue, { color: colors.muted }]}>{todayProgress.jokesWritten}/{goals.dailyWriteTarget}</Text>
          </View>
          <View style={styles.goalRow}>
            <Ionicons name="timer-outline" size={19} color={colors.mint} />
            <Text style={[styles.goalLabel, { color: colors.text }]}>Practice</Text>
            <Progress value={todayProgress.practiceMinutes} max={goals.dailyPracticeMinutes} color={colors.mint} />
            <Text style={[styles.goalValue, { color: colors.muted }]}>{todayProgress.practiceMinutes}/{goals.dailyPracticeMinutes}m</Text>
          </View>
        </AppCard>

        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Quick actions</Text>
        <View style={styles.quickRow}>
          <QuickAction icon="document-text-outline" label="New Joke" color={colors.lavender} onPress={() => router.push('/joke-builder')} />
          <QuickAction icon="library-outline" label="Library" color={colors.lavender} onPress={() => router.push('/jokes')} />
          <QuickAction icon="bulb-outline" label="Bit Wizard" color={colors.lavender} onPress={() => router.push('/bit-wizard')} />
          <QuickAction icon="list-outline" label="Setlist" color={colors.warning} onPress={() => router.push('/(tabs)/setlist')} />
          <QuickAction icon="play-circle-outline" label="Practice" color={colors.mint} onPress={() => router.push('/practice')} />
          <QuickAction icon="people-outline" label="Crowd Logger" color={colors.mint} onPress={() => router.push('/crowd-logger')} />
        </View>

        <View style={styles.statsRow}>
          {[
            { icon: 'document-text-outline' as const, value: jokes.length, label: 'Total jokes', color: colors.lavender },
            { icon: 'star-outline' as const, value: ready, label: 'Stage ready', color: colors.mint },
            { icon: 'flame-outline' as const, value: hot, label: 'Hot jokes', color: colors.red },
          ].map(stat => (
            <AppCard key={stat.label} style={styles.stat}>
              <Ionicons name={stat.icon} size={21} color={stat.color} />
              <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
            </AppCard>
          ))}
        </View>
        {setlists.length === 0 && <Text style={[styles.helper, { color: colors.muted }]}>Build a setlist when you have a few jokes ready.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  greetingRow: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.xs, paddingBottom: spacing.sm },
  eyebrow: { fontFamily: type.regular, fontSize: 15 },
  name: { fontFamily: type.bold, fontSize: 30, letterSpacing: -0.8, marginTop: 1 },
  tagline: { fontFamily: type.regular, fontSize: 14, marginTop: 2 },
  settings: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  promptIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  promptLabel: { fontFamily: type.semibold, fontSize: 11, letterSpacing: 0.3 },
  promptText: { fontFamily: type.semibold, fontSize: 15, lineHeight: 20, marginTop: 3 },
  write: { paddingHorizontal: 16, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  writeText: { fontFamily: type.semibold, color: '#FFFFFF', fontSize: 14 },
  dualRow: { flexDirection: 'row', gap: 10 },
  compactCard: { minHeight: 112, padding: 13 },
  compactIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  compactTitle: { fontFamily: type.semibold, fontSize: 14 },
  compactMeta: { fontFamily: type.regular, fontSize: 12, marginTop: 3 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  sectionTitle: { fontFamily: type.bold, fontSize: 19, letterSpacing: -0.2 },
  edit: { fontFamily: type.medium, fontSize: 13 },
  goalCard: { gap: 16 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalLabel: { fontFamily: type.medium, width: 58, fontSize: 13 },
  goalValue: { fontFamily: type.medium, width: 48, textAlign: 'right', fontSize: 12 },
  track: { flex: 1, height: 9, borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quick: { width: '31%', flexGrow: 1, minWidth: 92, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 3, gap: 7 },
  quickIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontFamily: type.medium, fontSize: 10.5, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 9, marginTop: 2 },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 13 },
  statValue: { fontFamily: type.bold, fontSize: 20, marginTop: 4 },
  statLabel: { fontFamily: type.regular, fontSize: 10.5, marginTop: 2, textAlign: 'center' },
  helper: { fontFamily: type.regular, fontSize: 12, textAlign: 'center' },
});
