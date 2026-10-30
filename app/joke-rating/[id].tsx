import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput, Platform,
} from 'react-native';
import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useData, JokeRating, CrowdType } from '@/context/DataContext';
import { getLocalDateString, parseLocalDateString, isValidDateString } from '@/lib/date';

const CROWD_TYPES: { value: CrowdType; label: string }[] = [
  { value: 'club', label: 'Club' },
  { value: 'college', label: 'College' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'any', label: 'Mixed' },
];

function StarRating({ value, onChange, color = Colors.primaryGold }: { value: number; onChange: (v: number) => void; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
        <Pressable key={n} onPress={() => { onChange(n); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
          <Ionicons
            name={n <= value ? 'star' : 'star-outline'}
            size={24}
            color={n <= value ? color : Colors.textMuted}
          />
        </Pressable>
      ))}
    </View>
  );
}

function RatingCard({ rating, joke, onDelete }: { rating: JokeRating; joke?: any; onDelete: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <View style={cardStyles.card}>
        <View style={cardStyles.header}>
          <Text style={cardStyles.date}>
            {parseLocalDateString(rating.performanceDate).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}
          </Text>
          <Pressable onPress={onDelete} hitSlop={8}>
            <Feather name="trash-2" size={16} color={Colors.textMuted} />
          </Pressable>
        </View>
        <View style={cardStyles.scores}>
          <View style={cardStyles.score}>
            <Text style={[cardStyles.scoreValue, { color: Colors.primaryGold }]}>{rating.rating}/10</Text>
            <Text style={cardStyles.scoreLabel}>Overall</Text>
          </View>
          <View style={cardStyles.score}>
            <Text style={[cardStyles.scoreValue, { color: Colors.statusStage }]}>{rating.laughScore}/10</Text>
            <Text style={cardStyles.scoreLabel}>Laughs</Text>
          </View>
        </View>
        {!!rating.notes && <Text style={cardStyles.notes}>{rating.notes}</Text>}
      </View>
    </Animated.View>
  );
}
const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardDarker,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textGray },
  scores: { flexDirection: 'row', gap: 24 },
  score: { alignItems: 'center', gap: 2 },
  scoreValue: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  scoreLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted },
  notes: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.white, lineHeight: 20 },
});

export default function JokeRatingScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { jokes, ratings, addRating, deleteRating } = useData();

  const joke = jokes.find(j => j.id === id);
  const jokeRatings = useMemo(() => ratings.filter(r => r.jokeId === id).sort((a, b) => b.performanceDate.localeCompare(a.performanceDate)), [ratings, id]);

  const [overallRating, setOverallRating] = useState(7);
  const [laughScore, setLaughScore] = useState(7);
  const [notes, setNotes] = useState('');
  const [performanceDate, setPerformanceDate] = useState(getLocalDateString());
  const [crowdType, setCrowdType] = useState<CrowdType>('any');
  const [kept, setKept] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const avgRating = jokeRatings.length > 0
    ? (jokeRatings.reduce((a, r) => a + r.rating, 0) / jokeRatings.length).toFixed(1)
    : null;

  async function saveRating() {
    const date = performanceDate.trim();
    if (!isValidDateString(date)) {
      Alert.alert('Invalid date', 'Use the format YYYY-MM-DD, for example 2026-03-14.');
      return;
    }
    setIsSaving(true);
    try {
      await addRating({
        jokeId: id,
        performanceDate: date,
        rating: overallRating,
        laughScore,
        notes: notes.trim(),
        crowdType,
        kept,
      });
      setNotes('');
      setOverallRating(7);
      setLaughScore(7);
      setCrowdType('any');
      setKept(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('Save rating error:', e);
      Alert.alert('Error', 'Could not save rating');
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDelete(ratingId: string) {
    Alert.alert('Delete Rating', 'Remove this rating?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRating(ratingId) },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to joke" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-down" size={24} color={Colors.textGray} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Joke Rating</Text>
          {joke && <Text style={styles.headerSub} numberOfLines={1}>{joke.title || joke.setup?.slice(0, 30)}</Text>}
        </View>
      </View>

      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 + (Platform.OS === 'web' ? 34 : 0) }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Average Stats */}
        {jokeRatings.length > 0 && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.avgCard}>
            <View style={styles.avgItem}>
              <Text style={[styles.avgValue, { color: Colors.primaryGold }]}>{avgRating}</Text>
              <Text style={styles.avgLabel}>Avg Rating</Text>
            </View>
            <View style={styles.avgDivider} />
            <View style={styles.avgItem}>
              <Text style={[styles.avgValue, { color: Colors.statusStage }]}>
                {(jokeRatings.reduce((a, r) => a + r.laughScore, 0) / jokeRatings.length).toFixed(1)}
              </Text>
              <Text style={styles.avgLabel}>Avg Laughs</Text>
            </View>
            <View style={styles.avgDivider} />
            <View style={styles.avgItem}>
              <Text style={styles.avgValue}>{jokeRatings.length}</Text>
              <Text style={styles.avgLabel}>Performances</Text>
            </View>
          </Animated.View>
        )}

        {/* Add Rating Form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Rate Performance</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Performance Date</Text>
            <TextInput
              style={styles.dateInput}
              value={performanceDate}
              onChangeText={setPerformanceDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Crowd</Text>
            <View style={styles.choiceRow}>
              {CROWD_TYPES.map(option => (
                <Pressable
                  key={option.value}
                  onPress={() => setCrowdType(option.value)}
                  style={[styles.choice, crowdType === option.value && styles.choiceActive]}
                >
                  <Text style={[styles.choiceText, crowdType === option.value && styles.choiceTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            style={styles.keptRow}
            onPress={() => setKept(value => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: kept }}
          >
            <Ionicons
              name={kept ? 'checkbox' : 'square-outline'}
              size={21}
              color={kept ? Colors.statusStage : Colors.textMuted}
            />
            <Text style={styles.keptText}>Keep this joke in my set</Text>
          </Pressable>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Overall Rating: <Text style={{ color: Colors.primaryGold }}>{overallRating}/10</Text></Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              <StarRating value={overallRating} onChange={setOverallRating} color={Colors.primaryGold} />
            </ScrollView>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Laugh Score: <Text style={{ color: Colors.statusStage }}>{laughScore}/10</Text></Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              <StarRating value={laughScore} onChange={setLaughScore} color={Colors.statusStage} />
            </ScrollView>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="How did the joke land? What could improve?..."
              placeholderTextColor={Colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
            onPress={saveRating}
            disabled={isSaving}
          >
            <Ionicons name="star" size={18} color={Colors.oledBlack} />
            <Text style={styles.saveBtnText}>{isSaving ? 'Saving...' : 'Save Rating'}</Text>
          </Pressable>
        </View>

        {/* Past Ratings */}
        {jokeRatings.length > 0 && (
          <View style={styles.pastSection}>
            <Text style={styles.pastTitle}>Performance History</Text>
            {jokeRatings.map(rating => (
              <RatingCard
                key={rating.id}
                rating={rating}
                joke={joke}
                onDelete={() => confirmDelete(rating.id)}
              />
            ))}
          </View>
        )}
      </KeyboardAwareScrollViewCompat>
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
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.white },
  headerSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textGray, marginTop: 2 },
  scroll: { paddingHorizontal: 20, gap: 16 },
  avgCard: {
    backgroundColor: Colors.cardDark,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avgItem: { alignItems: 'center', gap: 4 },
  avgValue: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.white },
  avgLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textGray },
  avgDivider: { width: 1, height: 40, backgroundColor: Colors.border },
  formCard: {
    backgroundColor: Colors.cardDark,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  formTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.white },
  field: { gap: 8 },
  fieldLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textGray },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    backgroundColor: Colors.oledBlack,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  choiceActive: { backgroundColor: Colors.primaryGold + '22', borderColor: Colors.primaryGold },
  choiceText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textGray },
  choiceTextActive: { color: Colors.primaryGold },
  keptRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 2 },
  keptText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textGray },
  dateInput: {
    backgroundColor: Colors.oledBlack,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.white,
  },
  notesInput: {
    backgroundColor: Colors.oledBlack,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.white,
    minHeight: 80,
  },
  saveBtn: {
    backgroundColor: Colors.primaryGold,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.oledBlack },
  pastSection: { gap: 12 },
  pastTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.white },
});
