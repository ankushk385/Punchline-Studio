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
import { Colors } from '@/constants/colors';
import { useData, Joke } from '@/context/DataContext';

function JokeCard({ joke, onPress, onDelete }: { joke: Joke; onPress: () => void; onDelete: () => void }) {
  const avgRating = undefined; // can be computed from ratings if needed

  return (
    <Animated.View entering={FadeInDown.duration(300)} layout={Layout.springify()}>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
        onPress={onPress}
      >
        <View style={styles.cardHeader}>
          <View style={styles.micIcon}>
            <Ionicons name="mic" size={16} color={Colors.primaryGold} />
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {joke.title || joke.setup?.slice(0, 30) || 'Untitled'}
          </Text>
          <Pressable accessibilityLabel={`Delete ${joke.title}`} onPress={onDelete} hitSlop={10}>
            <Feather name="trash-2" size={16} color={Colors.textMuted} />
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
            <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.versionText}>{joke.versions.length} version{joke.versions.length !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function JokesScreen() {
  const insets = useSafeAreaInsets();
  const { jokes, deleteJoke } = useData();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return jokes;
    const q = search.toLowerCase();
    return jokes.filter(j =>
      j.title.toLowerCase().includes(q) ||
      j.setup.toLowerCase().includes(q) ||
      j.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [jokes, search]);

  function confirmDelete(id: string) {
    Alert.alert('Delete Joke', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteJoke(id) },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close joke list" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-down" size={24} color={Colors.textGray} />
        </Pressable>
        <Text style={styles.headerTitle}>My Jokes</Text>
        <Pressable
          accessibilityLabel="Add joke"
          style={styles.addBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/joke-builder'); }}
        >
          <Ionicons name="add" size={22} color={Colors.oledBlack} />
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={Colors.textGray} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search jokes..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {!!search && <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color={Colors.textGray} /></Pressable>}
      </View>

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
          <View style={styles.empty}>
            <Ionicons name="mic-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>{search ? 'No matches' : 'No jokes yet'}</Text>
            <Text style={styles.emptySubtitle}>
              {search ? 'Try a different search' : 'Tap + to write your first joke'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        scrollEnabled={filtered.length > 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.oledBlack },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  headerTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 24, color: Colors.white },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardDark,
    borderRadius: 12,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.white,
  },
  countText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textGray,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  list: { paddingHorizontal: 20, gap: 12 },
  card: {
    backgroundColor: Colors.cardDark,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  micIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.primaryGold + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.white },
  setup: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textGray, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagsRow: { flexDirection: 'row', gap: 6 },
  tag: { backgroundColor: Colors.cardDarker, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.tagText },
  duration: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.primaryGold },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  versionText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.white },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textGray },
});
