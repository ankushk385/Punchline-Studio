import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useData } from '@/context/DataContext';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppColors, spacing, type } from '@/theme/tokens';
import { AppScreen, PlaybillHeader } from '@/components/ui/Playbill';

const STEPS = [
  { key: 'premise', title: "What's the premise?", subtitle: "The raw observation or situation. Don't filter yet.", placeholder: "I noticed that... / Something weird about... / Why does everyone...", icon: '💡' },
  { key: 'angle', title: "What's the unexpected angle?", subtitle: "The surprising way of looking at it. What's the twist?", placeholder: "The funny thing nobody mentions is... / What if it's actually...", icon: '🔄' },
  { key: 'setup', title: "Write the Setup", subtitle: "One or two sentences that create expectation without giving it away.", placeholder: "Dating apps are weird...", icon: '🎯' },
  { key: 'punchline', title: "Write the Punchline", subtitle: "The subversion. The twist. The word that makes the joke land.", placeholder: "It's like ordering humans on Swiggy.", icon: '💥' },
  { key: 'tag', title: "Add a Tag (optional)", subtitle: "A second, shorter punchline that rides the first laugh.", placeholder: "And it has a rating system. She's a 4.2.", icon: '🏷️' },
  { key: 'callback', title: "Any Callback? (optional)", subtitle: "A reference back to this joke later in your set.", placeholder: "Remember that Swiggy order? Still on the way.", icon: '🔁' },
];

export default function BitWizardScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ jokeId?: string }>();
  const { addJoke, updateJoke, jokes, saveJokeVersion } = useData();
  const { colors } = useAppTheme();
  const styles = makeStyles(colors);

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const isFirst = currentStep === 0;
  const currentAnswer = answers[step.key] || '';
  const isOptional = step.key === 'tag' || step.key === 'callback';

  function handleNext() {
    if (!isOptional && !currentAnswer.trim() && (step.key === 'premise' || step.key === 'setup')) return;
    if (isLast) { handleFinish(); return; }
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
          await updateJoke(params.jokeId, { title, setup, punchline: answers.punchline || '', tag: answers.tag || '', callback: answers.callback || '' });
        }
      } else {
        await addJoke({ title, setup, punchline: answers.punchline || '', tag: answers.tag || '', callback: answers.callback || '', tags: [], duration: 90, jokeState: 'draft', crowdType: 'any' });
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
    <AppScreen>
      <PlaybillHeader number="04" title="Bit Wizard" subtitle={`Step ${currentStep + 1} of ${STEPS.length}`} back />
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
        <Animated.View key={currentStep} entering={SlideInRight.duration(300)} exiting={SlideOutLeft.duration(200)}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepIcon}>{step.icon}</Text>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepSubtitle}>{step.subtitle}</Text>
            {isOptional && <Text style={styles.optionalBadge}>Optional — tap Next to skip</Text>}
          </View>
          <View style={styles.inputCard}>
            <TextInput style={styles.textInput} value={currentAnswer} onChangeText={val => setAnswers(prev => ({ ...prev, [step.key]: val }))} placeholder={step.placeholder} placeholderTextColor={colors.subtle} multiline autoFocus textAlignVertical="top" />
          </View>
          {currentStep >= 2 && (
            <View style={styles.buildingCard}>
              <Text style={styles.buildingTitle}>Your Bit So Far</Text>
              {answers.setup && <View style={styles.buildingRow}><Text style={styles.buildingLabel}>Setup</Text><Text style={styles.buildingText}>{answers.setup}</Text></View>}
              {answers.punchline && <View style={styles.buildingRow}><Text style={[styles.buildingLabel, { color: colors.blue }]}>Punchline</Text><Text style={styles.buildingText}>{answers.punchline}</Text></View>}
              {answers.tag && <View style={styles.buildingRow}><Text style={[styles.buildingLabel, { color: colors.mintStrong }]}>Tag</Text><Text style={styles.buildingText}>{answers.tag}</Text></View>}
            </View>
          )}
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
      <View style={[styles.nav, { paddingBottom: insets.bottom + 16 }]}>
        {!isFirst && <Pressable style={styles.backBtn} onPress={handleBack}><Ionicons name="chevron-back" size={20} color={colors.text} /></Pressable>}
        <Pressable style={[styles.nextBtn, (!currentAnswer.trim() && !isOptional && (step.key === 'premise' || step.key === 'setup')) && { opacity: 0.5 }]} onPress={handleNext} disabled={isSaving}>
          <Text style={styles.nextBtnText}>{isLast ? (isSaving ? 'Saving...' : 'Save Bit') : 'Next'}</Text>
          <Ionicons name={isLast ? 'checkmark' : 'chevron-forward'} size={18} color={colors.white} />
        </Pressable>
      </View>
    </AppScreen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    progressTrack: { height: 4, backgroundColor: colors.surface, marginHorizontal: spacing.md },
    progressFill: { height: '100%', backgroundColor: colors.blue },
    scroll: { paddingHorizontal: spacing.md, paddingTop: spacing.xl, gap: spacing.lg },
    stepHeader: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.xs },
    stepIcon: { fontSize: 48, marginBottom: spacing.xs },
    stepTitle: { fontFamily: type.bold, fontSize: 26, color: colors.text, textAlign: 'center' },
    stepSubtitle: { fontFamily: type.regular, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
    optionalBadge: { fontFamily: type.regular, fontSize: 11, color: colors.muted, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 4, marginTop: spacing.xs },
    inputCard: { backgroundColor: colors.card, borderRadius: 0, borderWidth: 1.25, borderColor: colors.border, padding: spacing.md, minHeight: 140 },
    textInput: { fontFamily: type.regular, fontSize: 16, color: colors.text, lineHeight: 24, minHeight: 100 },
    buildingCard: { backgroundColor: colors.card, borderWidth: 1.25, borderColor: colors.border, borderLeftWidth: 7, borderLeftColor: colors.gold, padding: spacing.md, gap: spacing.sm, marginTop: spacing.lg },
    buildingTitle: { fontFamily: type.bold, fontSize: 12, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.7 },
    buildingRow: { gap: 4 },
    buildingLabel: { fontFamily: type.bold, fontSize: 10, color: colors.gold, textTransform: 'uppercase', letterSpacing: 0.6 },
    buildingText: { fontFamily: type.regular, fontSize: 14, color: colors.text, lineHeight: 20 },
    nav: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md, borderTopWidth: 1.25, borderTopColor: colors.border, backgroundColor: colors.background },
    backBtn: { width: 52, height: 52, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.blue, borderWidth: 1.5, borderColor: colors.blue, paddingVertical: spacing.sm },
    nextBtnText: { fontFamily: type.bold, fontSize: 15, color: colors.white },
  });
}
