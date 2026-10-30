import React from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform,
} from 'react-native';
import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useData, JokeVersion } from '@/context/DataContext';

function VersionCard({ version, isLatest, onRevert }: { version: JokeVersion; isLatest: boolean; onRevert: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <View style={styles.versionCard}>
        <View style={styles.versionHeader}>
          <View style={styles.versionBadge}>
            <Text style={styles.versionNum}>v{version.version}</Text>
          </View>
          {isLatest && (
            <View style={styles.latestBadge}>
              <Text style={styles.latestText}>Current</Text>
            </View>
          )}
          <Text style={styles.versionDate}>
            {new Date(version.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          {!isLatest && (
            <Pressable
              style={({ pressed }) => [styles.revertBtn, pressed && { opacity: 0.8 }]}
              onPress={onRevert}
            >
              <Ionicons name="arrow-undo" size={14} color={Colors.softPurple} />
              <Text style={styles.revertText}>Revert</Text>
            </Pressable>
          )}
        </View>

        {!!version.note && (
          <Text style={styles.versionNote}>{version.note}</Text>
        )}

        <View style={styles.versionContent}>
          {version.setup ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: Colors.primaryGold }]}>Setup</Text>
              <Text style={styles.fieldText}>{version.setup}</Text>
            </View>
          ) : null}
          {version.punchline ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: Colors.primaryPurple }]}>Punchline</Text>
              <Text style={styles.fieldText}>{version.punchline}</Text>
            </View>
          ) : null}
          {version.tag ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: Colors.statusStage }]}>Tag</Text>
              <Text style={styles.fieldText}>{version.tag}</Text>
            </View>
          ) : null}
          {version.callback ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: Colors.statusDev }]}>Callback</Text>
              <Text style={styles.fieldText}>{version.callback}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

export default function JokeVersionsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { jokes, revertJokeVersion } = useData();
  const joke = jokes.find(j => j.id === id);

  if (!joke) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: Colors.white }}>Joke not found</Text>
      </View>
    );
  }

  const currentJokeId = joke.id;
  const versions = [...joke.versions].sort((a, b) => b.version - a.version);

  function confirmRevert(version: JokeVersion) {
    Alert.alert(
      `Revert to v${version.version}?`,
      'This will replace the current joke content with this version. The current version will be saved first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revert',
          style: 'destructive',
          onPress: async () => {
            await revertJokeVersion(currentJokeId, version.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Reverted', `Joke reverted to v${version.version}`);
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to joke" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-down" size={24} color={Colors.textGray} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Version History</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{joke.title || joke.setup?.slice(0, 30)}</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{versions.length}</Text>
        </View>
      </View>

      {versions.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No versions yet</Text>
          <Text style={styles.emptySubtitle}>
            Version history is automatically saved when you edit and save a joke
          </Text>
        </View>
      ) : (
        <FlatList
          data={versions}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 + (Platform.OS === 'web' ? 34 : 0) }]}
          renderItem={({ item, index }) => (
            <VersionCard
              version={item}
              isLatest={index === 0}
              onRevert={() => confirmRevert(item)}
            />
          )}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={16} color={Colors.textGray} />
              <Text style={styles.infoText}>
                Versions are saved automatically when you edit a joke. Max 20 versions stored.
              </Text>
            </View>
          }
        />
      )}
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
  countBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  countText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.primaryGold },
  list: { paddingHorizontal: 20, gap: 12 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.cardDarker,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  infoText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textGray, lineHeight: 18 },
  versionCard: {
    backgroundColor: Colors.cardDark,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  versionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  versionBadge: {
    backgroundColor: Colors.cardDarker,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primaryGold + '44',
  },
  versionNum: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.primaryGold },
  latestBadge: {
    backgroundColor: Colors.statusStage + '22',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.statusStage + '44',
  },
  latestText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.statusStage },
  versionDate: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted },
  revertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.softPurple + '22',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.softPurple + '44',
  },
  revertText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.softPurple },
  versionNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textGray,
    fontStyle: 'italic',
    backgroundColor: Colors.cardDarker,
    borderRadius: 8,
    padding: 8,
  },
  versionContent: { gap: 10 },
  field: { gap: 4 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  fieldText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.white, lineHeight: 20 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.white },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textGray, textAlign: 'center', lineHeight: 22 },
});
