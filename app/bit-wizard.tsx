import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useData } from '@/context/DataContext';

const STEPS = [
  {
    key: 'premise',
    title: "What's the premise?",
    subtitle: "The raw observation or situation. Don't filter yet.",
    placeholder: "I noticed that... / Something weird about... / Why does everyone...",
    icon: '💡',
  },
  {
    key: 'angle',
    title: "What's the unexpected angle?",
    subtitle: "The surprising way of looking at it. What's the twist?",
    placeholder: "The funny thing nobody mentions is... / What if it's actually...",
    icon: '🔄',
  },
  {
    key: 'setup',
    title: "Write the Setup",
    subtitle: "One or two sentences that create expectation without giving it away.",
    placeholder: "Dating apps are weird...",
    icon: '🎯',
  },
  {
    key: 'punchline',
    title: "Write the Punchline",
    subtitle: "The subversion. The twist. The word that makes the joke land.",
    placeholder: "It's like ordering humans on Swiggy.",
    icon: '💥',
  },
  {
    key: 'tag',
    title: "Add a Tag (optional)",
    subtitle: "A second, shorter punchline that rides the first laugh.",
    placeholder: "And it has a rating system. She's a 4.2.",
    icon: '🏷️',
  },
  {
    key: 'callback',
    title: "Any Callback? (optional)",
    subtitle: "A reference back to this joke later in your set.",
    placeholder: "Remember that Swiggy order? Still on the way.",
    icon: '🔁',
  },
];

export default function BitWizardScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ jokeId?: string }>();
  const { addJoke, updateJoke, jokes, saveJokeVersion } = useData();

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const isFirst = currentStep === 0;
  const currentAnswer = answers[step.key] || '';
  const isOptional = step.key === 'tag' || step.key === 'callback';

  function handleNext() {
    if (!isOptional && !currentAnswer.trim() && step.key !== 'tag' && step.key !== 'callback') {
      if (!currentAnswer.trim() && (step.key === 'premise' || step.key === 'setup')) return;
    }
    if (isLast) {
      handleFinish();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep(s => s + 1);
  }

  function handleBack() {
    if (isFirst) { router.back(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep(s => s - 1);
  }

  async function handleFinish() {
    setIsSaving(true);
    try {
      const setup = answers.setup || answers.premise || '';
      const title = setup.slice(0, 30) || 'New Bit';

      if (params.jokeId) {
        const existing = jokes.find(j => j.id === params.jokeId);
        if (existing) {
          await saveJokeVersion(params.jokeId, 'Before Bit Wizard');
          await updateJoke(params.jokeId, {
            title,
            setup,
            punchline: answers.punchline || '',
            tag: answers.tag || '',
            callback: answers.callback || '',
          });
        }
      } else {
        await addJoke({
          title,
          setup,
          punchline: answers.punchline || '',
          tag: answers.tag || '',
          callback: answers.callback || '',
          tags: [],
          duration: 90,
          jokeState: 'draft',
          crowdType: 'any',
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      console.error('Bit Wizard save error:', e);
    } finally {
      setIsSaving(false);
    }
  }

  const progress = (currentStep + 1) / STEPS.length;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable accessibilityLabel={isFirst ? 'Close Bit Wizard' : 'Back'} onPress={handleBack} hitSlop={10}>
          <Ionicons name={isFirst ? 'close' : 'arrow-back'} size={24} color={Colors.textGray} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 16 }}>
          <Text style={styles.headerTitle}>Bit Wizard</Text>
          <Text style={styles.headerSub}>Step {currentStep + 1} of {STEPS.length}</Text>
        </View>
        <Pressable onPress={handleFinish} hitSlop={10} disabled={isSaving}>
          <Text style={styles.skipText}>Skip to Save</Text>
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: `${progress * 100}%` as unknown as number }]} />
      </View>

      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 + (Platform.OS === 'web' ? 34 : 0) }]}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View key={currentStep} entering={SlideInRight.duration(300)} exiting={SlideOutLeft.duration(200)}>
          {/* Step icon + title */}
          <View style={styles.stepHeader}>
            <Text style={styles.stepIcon}>{step.icon}</Text>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepSubtitle}>{step.subtitle}</Text>
            {isOptional && <Text style={styles.optionalBadge}>Optional — tap Next to skip</Text>}
          </View>

          {/* Input */}
          <View style={styles.inputCard}>
            <TextInput
              style={styles.textInput}
              value={currentAnswer}
              onChangeText={val => setAnswers(prev => ({ ...prev, [step.key]: val }))}
              placeholder={step.placeholder}
              placeholderTextColor={Colors.textMuted}
              multiline
              autoFocus
              textAlignVertical="top"
            />
          </View>

          {/* Show what they've built so far */}
          {currentStep >= 2 && (
            <View style={styles.buildingCard}>
              <Text style={styles.buildingTitle}>Your Bit So Far</Text>
              {answers.setup && (
                <View style={styles.buildingRow}>
                  <Text style={styles.buildingLabel}>Setup</Text>
                  <Text style={styles.buildingText}>{answers.setup}</Text>
                </View>
              )}
              {answers.punchline && (
                <View style={styles.buildingRow}>
                  <Text style={[styles.buildingLabel, { color: Colors.primaryPurple }]}>Punchline</Text>
                  <Text style={styles.buildingText}>{answers.punchline}</Text>
                </View>
              )}
              {answers.tag && (
                <View style={styles.buildingRow}>
                  <Text style={[styles.buildingLabel, { color: Colors.statusStage }]}>Tag</Text>
                  <Text style={styles.buildingText}>{answers.tag}</Text>
                </View>
              )}
            </View>
          )}
        </Animated.View>
      </KeyboardAwareScrollViewCompat>

      {/* Navigation */}
      <View style={[styles.nav, { paddingBottom: insets.bottom + 16 + (Platform.OS === 'web' ? 34 : 0) }]}>
        {!isFirst && (
          <Pressable style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="chevron-back" size={20} color={Colors.textGray} />
          </Pressable>
        )}
        <Pressable
          style={[styles.nextBtn, (!currentAnswer.trim() && !isOptional && (step.key === 'premise' || step.key === 'setup')) && { opacity: 0.5 }]}
          onPress={handleNext}
          disabled={isSaving}
        >
          <Text style={styles.nextBtnText}>
            {isLast ? (isSaving ? 'Saving...' : 'Save Bit') : 'Next'}
          </Text>
          <Ionicons name={isLast ? 'checkmark' : 'chevron-forward'} size={18} color={Colors.oledBlack} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.oledBlack },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.white },
  headerSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  skipText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textMuted },
  progressTrack: { height: 3, backgroundColor: Colors.cardDarker, marginHorizontal: 20, borderRadius: 2 },
  progressFill: { height: '100%', backgroundColor: Colors.primaryPurple, borderRadius: 2 },
  scroll: { paddingHorizontal: 20, paddingTop: 28, gap: 20 },
  stepHeader: { alignItems: 'center', marginBottom: 24, gap: 8 },
  stepIcon: { fontSize: 48, marginBottom: 8 },
  stepTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, color: Colors.white, textAlign: 'center' },
  stepSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.textGray, textAlign: 'center', lineHeight: 22 },
  optionalBadge: {
    fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted,
    backgroundColor: Colors.cardDarker, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4, marginTop: 4,
  },
  inputCard: {
    backgroundColor: Colors.cardDark, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, padding: 20, minHeight: 140,
  },
  textInput: {
    fontFamily: 'Inter_400Regular', fontSize: 18,
    color: Colors.white, lineHeight: 28, minHeight: 100,
  },
  buildingCard: {
    backgroundColor: Colors.cardDark, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12,
    borderLeftWidth: 3, borderLeftColor: Colors.primaryGold,
  },
  buildingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.textGray },
  buildingRow: { gap: 4 },
  buildingLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.primaryGold, textTransform: 'uppercase' },
  buildingText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.white, lineHeight: 20 },
  nav: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.oledBlack,
  },
  backBtn: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: Colors.cardDark, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primaryGold, borderRadius: 14, paddingVertical: 15,
  },
  nextBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.oledBlack },
});
