import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Platform,
} from 'react-native';
import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useData, Joke } from '@/context/DataContext';
import { EmptyState, FilterChip, PlaybillCard, PlaybillHeader } from '@/components/ui/Playbill';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppColors, spacing, type } from '@/theme/tokens';

function JokeCard({ joke, onPress, onDelete }: { joke: Joke; onPress: () => void; onDelete: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Animated.View entering={FadeInDown.duration(300)} layout={Layout.springify()}>
      <Pressable style={({ pressed }) => [pressed && { opacity: 0.72 }]} onPress={onPress}>
       <PlaybillCard accent={joke.jokeState === 'stage-ready' ? 'mint' : joke.jokeState === 'developing' ? 'gold' : 'blue'} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {joke.title || joke.setup?.slice(0, 30) || 'Untitled'}
          </Text>
          <Pressable accessibilityLabel={`Delete ${joke.title}`} onPress={onDelete} hitSlop={10}>
            <Feather name="trash-2" size={17} color={colors.muted} />
          </Pressable>
        </View>
        {!!joke.setup && (
          <Text style={styles.setup} numberOfLines={2}>{joke.setup}</Text>
        )}
        <View style={styles.cardFooter}>
          {joke.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {joke.tags.slice(0, 3).map(t => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.duration}>
            {joke.duration >= 60 ? `${joke.duration / 60}min` : `${joke.duration}s`}
          </Text>
        </View>
        {joke.versions.length > 0 && (
          <View style={styles.versionRow}>
            <Ionicons name="time-outline" size={13} color={colors.muted} />
            <Text style={styles.versionText}>{joke.versions.length} version{joke.versions.length !== 1 ? 's' : ''}</Text>
          </View>
        )}
       </PlaybillCard>
      </Pressable>
    </Animated.View>
  );
}

export default function JokesScreen() {
  const insets = useSafeAreaInsets();
  const { jokes, deleteJoke } = useData();
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'draft' | 'developing' | 'stage-ready'>('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return jokes.filter(j => (filter === 'all' || j.jokeState === filter) && (
      !q ||
      j.title.toLowerCase().includes(q) ||
      j.setup.toLowerCase().includes(q) ||
      j.tags.some(t => t.toLowerCase().includes(q))
    ));
  }, [filter, jokes, search]);

  function confirmDelete(id: string) {
    Alert.alert('Delete Joke', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteJoke(id) },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 30 : insets.top }]}> 
      <PlaybillHeader number="03" title="Material" subtitle="Write. Test. Refine. Repeat." />
      <View style={styles.actionRow}>
        <Text style={styles.kicker}>JOKE LIBRARY</Text>
        <Pressable
          accessibilityLabel="Add joke"
          style={styles.addBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/joke-builder'); }}
        >
          <Ionicons name="add" size={22} color={colors.white} /><Text style={styles.addText}>NEW JOKE</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <Feather name="search" size={17} color={colors.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search jokes..."
          placeholderTextColor={colors.subtle}
          value={search}
          onChangeText={setSearch}
        />
        {!!search && <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable>}
      </View>

      <View style={styles.filters}>{(['all', 'draft', 'developing', 'stage-ready'] as const).map(value => <FilterChip key={value} label={value === 'all' ? 'All' : value === 'stage-ready' ? 'Stage Ready' : value[0].toUpperCase() + value.slice(1)} selected={filter === value} onPress={() => setFilter(value)} />)}</View>

      <Text style={styles.countText}>{filtered.length} joke{filtered.length !== 1 ? 's' : ''}</Text>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 + (Platform.OS === 'web' ? 34 : 0) }]}
        renderItem={({ item }) => (
          <JokeCard
            joke={item}
            onPress={() => router.push({ pathname: '/joke-builder', params: { jokeId: item.id } })}
            onDelete={() => confirmDelete(item.id)}
          />
        )}
        ListEmptyComponent={
          <EmptyState icon="mic-outline" title={search ? 'No matches' : 'No jokes yet'} body={search ? 'Try a different search or filter.' : 'Write your first joke and start building material.'} />
        }
        showsVerticalScrollIndicator={false}
        scrollEnabled={filtered.length > 0}
      />
    </View>
  );
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  actionRow: { minHeight: 58, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontFamily: type.display, fontSize: 25, color: colors.text, letterSpacing: 0.5 },
  addBtn: {
    minWidth: 116,
    height: 44,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row', gap: 6,
  },
  addText: { fontFamily: type.bold, fontSize: 11, color: colors.white, letterSpacing: 0.5 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.input,
    marginHorizontal: spacing.md,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: type.regular,
    fontSize: 14,
    color: colors.text,
  },
  filters: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, marginBottom: 12 },
  countText: {
    fontFamily: type.medium,
    fontSize: 13,
    color: colors.muted,
    paddingHorizontal: spacing.md,
    marginBottom: 12,
  },
  list: { paddingHorizontal: spacing.md, gap: 9 },
  card: {
    padding: 13,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontFamily: type.bold, fontSize: 15, color: colors.text },
  setup: { fontFamily: type.regular, fontSize: 13, color: colors.muted, lineHeight: 19 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagsRow: { flexDirection: 'row', gap: 6 },
  tag: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontFamily: type.medium, fontSize: 10, color: colors.text },
  duration: { fontFamily: type.medium, fontVariant: ['tabular-nums'], fontSize: 12, color: colors.gold },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  versionText: { fontFamily: type.regular, fontSize: 11, color: colors.muted },
});
