import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { ReactNode, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppColors, spacing, type } from '@/theme/tokens';

type Accent = 'blue' | 'red' | 'gold' | 'mint';
type Tone = Accent | 'neutral';

export function AppScreen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets(); const { colors } = useAppTheme();
  return <View style={[{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }, style]}>{children}</View>;
}

export function PlaybillHeader({ title, subtitle, number, back = false }: { title: string; subtitle?: string; number?: string; back?: boolean }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={styles.header}>
    {back && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>}
    {number && <View style={styles.headerNumber}><Text style={styles.headerNumberText}>{number}</Text></View>}
    <View style={{ flex: 1 }}><Text style={styles.headerTitle}>{title}</Text>{subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}</View>
    <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={styles.iconButton}><Ionicons name="settings-outline" size={21} color={colors.text} /></Pressable>
  </View>;
}

export function NumberedSection({ number, title, subtitle, accent = 'gold', children }: { number: string; title: string; subtitle?: string; accent?: Accent; children?: ReactNode }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={styles.section}><View style={[styles.sectionRail, { backgroundColor: colors[accent] }]}><Text style={[styles.sectionNumber, { color: accent === 'gold' || accent === 'mint' ? colors.black : colors.white }]}>{number}</Text><View style={{ flex: 1 }}><Text style={[styles.sectionTitle, { color: accent === 'gold' || accent === 'mint' ? colors.black : colors.white }]}>{title}</Text>{subtitle && <Text style={[styles.sectionSubtitle, { color: accent === 'gold' || accent === 'mint' ? colors.black : colors.white }]}>{subtitle}</Text>}</View></View>{children}</View>;
}

export function PlaybillCard({ children, accent, style }: { children: ReactNode; accent?: Accent; style?: StyleProp<ViewStyle> }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={[styles.card, accent && { borderLeftWidth: 7, borderLeftColor: colors[accent] }, style]}>{children}</View>;
}

function Button({ label, icon, onPress, disabled, kind }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; kind: 'primary' | 'secondary' | 'destructive' }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  const primary = kind === 'primary'; const destructive = kind === 'destructive'; const foreground = primary || destructive ? colors.white : colors.text;
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, primary && { backgroundColor: colors.blue, borderColor: colors.blue }, destructive && { backgroundColor: colors.red, borderColor: colors.red }, { opacity: disabled ? 0.42 : pressed ? 0.78 : 1 }]}>{icon && <Ionicons name={icon} size={19} color={foreground} />}<Text style={[styles.buttonText, { color: foreground }]}>{label}</Text></Pressable>;
}
export const PrimaryButton = (props: Omit<React.ComponentProps<typeof Button>, 'kind'>) => <Button {...props} kind="primary" />;
export const SecondaryButton = (props: Omit<React.ComponentProps<typeof Button>, 'kind'>) => <Button {...props} kind="secondary" />;
export const DestructiveButton = (props: Omit<React.ComponentProps<typeof Button>, 'kind'>) => <Button {...props} kind="destructive" />;

export function FilterChip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && { backgroundColor: colors.blue, borderColor: colors.blue }]}><Text style={[styles.chipText, selected && { color: colors.white }]}>{label}</Text></Pressable>;
}
export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]); const background = tone === 'neutral' ? colors.surface : colors[`${tone}Soft` as keyof AppColors] as string; const foreground = tone === 'neutral' ? colors.muted : tone === 'mint' ? colors.mintStrong : colors[tone];
  return <View style={[styles.badge, { backgroundColor: background, borderColor: foreground }]}><Text style={[styles.badgeText, { color: foreground }]}>{label}</Text></View>;
}
export function PlaybillInput({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={{ gap: 5 }}><Text style={styles.inputLabel}>{label}</Text><TextInput {...props} placeholderTextColor={colors.subtle} style={[styles.input, props.multiline && styles.multiline, error && { borderColor: colors.red }, props.style]} />{error && <Text style={styles.errorText}>{error}</Text>}</View>;
}
export function EmptyState({ icon = 'sparkles-outline', title, body }: { icon?: keyof typeof Ionicons.glyphMap; title: string; body: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]); return <View style={styles.state}><Ionicons name={icon} size={30} color={colors.blue} /><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateBody}>{body}</Text></View>; }
export function LoadingState({ label = 'Loading…' }: { label?: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]); return <View style={styles.state}><ActivityIndicator color={colors.blue} /><Text style={styles.stateBody}>{label}</Text></View>; }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]); return <View style={styles.state}><Ionicons name="warning-outline" size={30} color={colors.red} /><Text style={styles.stateTitle}>Something went wrong</Text><Text style={styles.stateBody}>{message}</Text>{retry && <SecondaryButton label="Try again" onPress={retry} />}</View>; }
export function SyncStatus({ pending, synced, label }: { pending: number; synced: boolean; label?: string }) { return <StatusBadge tone={synced && pending === 0 ? 'mint' : 'gold'} label={label ?? (pending ? `${pending} pending` : 'Synced')} />; }

export function RatingControl({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  const { colors } = useAppTheme(); return <View accessibilityLabel="One to five star rating" style={{ flexDirection: 'row' }}>{[1, 2, 3, 4, 5].map(star => <Pressable key={star} accessibilityRole="button" accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`} onPress={() => onChange(star)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={(value ?? 0) >= star ? 'star' : 'star-outline'} size={27} color={colors.gold} /></Pressable>)}</View>;
}
export function LaughScoreControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]); return <View><View style={styles.scoreHead}><Text style={styles.inputLabel}>Laugh score</Text><Text style={styles.scoreValue}>{value}/100</Text></View><View style={styles.scoreRow}>{[0, 25, 50, 75, 100].map(score => <Pressable key={score} onPress={() => onChange(score)} style={[styles.scoreStep, value >= score && { backgroundColor: colors.gold }]}><Text style={[styles.scoreStepText, value >= score && { color: colors.black }]}>{score}</Text></Pressable>)}</View></View>;
}
export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) { const { colors } = useAppTheme(); const styles = useMemo(() => makeStyles(colors), [colors]); return <View style={styles.segment}>{options.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: value === option.value }} onPress={() => onChange(option.value)} style={[styles.segmentItem, value === option.value && { backgroundColor: colors.blue }]}><Text style={[styles.segmentText, value === option.value && { color: colors.white }]}>{option.label}</Text></Pressable>)}</View>; }

export function BottomNavigation() { return null; }

const makeStyles = (colors: AppColors) => StyleSheet.create({
  header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, borderBottomWidth: 1.5, borderBottomColor: colors.border }, headerNumber: { width: 48, height: 42, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' }, headerNumberText: { fontFamily: type.display, fontSize: 29, color: colors.black }, headerTitle: { fontFamily: type.display, fontSize: 34, lineHeight: 35, color: colors.text, letterSpacing: 0.3 }, headerSubtitle: { fontFamily: type.regular, fontSize: 11.5, color: colors.muted, marginTop: 1 }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  section: { borderWidth: 1.5, borderColor: colors.border }, sectionRail: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 12 }, sectionNumber: { width: 58, textAlign: 'center', fontFamily: type.display, fontSize: 33 }, sectionTitle: { fontFamily: type.bold, fontSize: 15 }, sectionSubtitle: { fontFamily: type.regular, fontSize: 10.5, marginTop: 1 },
  card: { backgroundColor: colors.card, borderWidth: 1.25, borderColor: colors.border, padding: spacing.md }, button: { minHeight: 48, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, buttonText: { fontFamily: type.bold, fontSize: 14 },
  chip: { minHeight: 44, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }, chipText: { fontFamily: type.medium, fontSize: 12, color: colors.text }, badge: { minHeight: 26, borderWidth: 1, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }, badgeText: { fontFamily: type.bold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputLabel: { fontFamily: type.bold, fontSize: 11, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.7 }, input: { minHeight: 48, borderWidth: 1.25, borderColor: colors.border, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 12, fontFamily: type.regular, fontSize: 14 }, multiline: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' }, errorText: { fontFamily: type.regular, fontSize: 11, color: colors.red },
  state: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }, stateTitle: { fontFamily: type.bold, fontSize: 18, color: colors.text }, stateBody: { fontFamily: type.regular, fontSize: 13, lineHeight: 19, textAlign: 'center', color: colors.muted },
  scoreHead: { flexDirection: 'row', justifyContent: 'space-between' }, scoreValue: { fontFamily: type.regular, fontVariant: ['tabular-nums'], color: colors.text }, scoreRow: { flexDirection: 'row', gap: 4, marginTop: 7 }, scoreStep: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, scoreStepText: { fontFamily: type.medium, fontSize: 11, color: colors.muted },
  segment: { flexDirection: 'row', borderWidth: 1.25, borderColor: colors.border, padding: 3, gap: 3 }, segmentItem: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center' }, segmentText: { fontFamily: type.bold, fontSize: 12, color: colors.text },
});
