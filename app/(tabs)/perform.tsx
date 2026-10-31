import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaybillHeader, PlaybillCard, StatusBadge } from '@/components/ui/Playbill';
import { usePerformanceSessions } from '@/context/PerformanceSessionContext';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppColors, spacing, type } from '@/theme/tokens';

const actions = [
  { title: 'Start Performance Session', body: 'Connect your gig, set, recording, markers, and review.', icon: 'radio-outline' as const, route: '/performance-session/setup' as const, primary: true },
  { title: 'Setlists', body: 'Build and order stage-ready material.', icon: 'list-outline' as const, route: '/(tabs)/setlist' as const },
  { title: 'Practice', body: 'Timer, ratings, and sound-paced teleprompter.', icon: 'timer-outline' as const, route: '/practice' as const },
  { title: 'Stage Mode', body: 'Open the high-contrast teleprompter.', icon: 'reader-outline' as const, route: '/practice?teleprompter=1' as const },
  { title: 'Recordings', body: 'Capture, play, upload, and share audio.', icon: 'mic-outline' as const, route: '/(tabs)/record' as const },
] as const;

export default function PerformScreen() {
  const insets = useSafeAreaInsets(); const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  const { sessions } = usePerformanceSessions();
  const pending = sessions.filter(session => session.status === 'review').length;
  return <View style={[styles.screen, { paddingTop: Platform.OS === 'web' ? 62 : insets.top }]}>
    <PlaybillHeader title="Perform" subtitle="Your set, front and center." number="04" />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}>
      {actions.map((action, index) => <Pressable key={action.title} onPress={() => router.push(action.route)} accessibilityRole="button">
        <PlaybillCard accent={'primary' in action && action.primary ? 'gold' : index % 2 ? 'mint' : 'blue'} style={styles.card}>
          <View style={styles.icon}><Ionicons name={action.icon} size={25} color={'primary' in action && action.primary ? colors.gold : colors.blue} /></View>
          <View style={{ flex: 1 }}><Text style={styles.title}>{action.title}</Text><Text style={styles.body}>{action.body}</Text></View>
          {'primary' in action && action.primary && <StatusBadge label="First" tone="gold" />}
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </PlaybillCard>
      </Pressable>)}
      <Pressable onPress={() => router.push('/performance-session/review')} disabled={!pending}>
        <PlaybillCard accent="red" style={[styles.card, !pending && { opacity: 0.55 }]}>
          <Ionicons name="clipboard-outline" size={25} color={colors.red} /><View style={{ flex: 1 }}><Text style={styles.title}>Pending Reviews</Text><Text style={styles.body}>{pending ? `${pending} show${pending === 1 ? '' : 's'} ready to review` : 'No incomplete show reviews'}</Text></View>
          <StatusBadge label={String(pending)} tone={pending ? 'red' : 'neutral'} />
        </PlaybillCard>
      </Pressable>
    </ScrollView>
  </View>;
}
const makeStyles = (colors: AppColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: 10 },
  card: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12 }, icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  title: { fontFamily: type.bold, fontSize: 17, color: colors.text }, body: { fontFamily: type.regular, fontSize: 12.5, lineHeight: 18, color: colors.muted, marginTop: 3 },
});
