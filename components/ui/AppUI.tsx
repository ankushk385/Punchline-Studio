import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing, type } from '@/theme/tokens';
import { playInterfaceSound } from '@/lib/interface-sounds';

export function AppCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, isDark } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: isDark ? 0 : 0.05 }, style]}>
      {children}
    </View>
  );
}

export function PrimaryButton({ label, icon, onPress, disabled, tone = 'amber', style }: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'amber' | 'lavender';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const background = tone === 'lavender' ? colors.lavender : colors.amber;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { playInterfaceSound('tap'); onPress(); }} style={({ pressed }) => [styles.button, { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.86 : 1 }, style]}>
      {icon && <Ionicons name={icon} size={19} color={tone === 'amber' ? colors.onAccent : colors.white} />}
      <Text style={[styles.buttonText, { color: tone === 'amber' ? colors.onAccent : colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function ScreenTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.titleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {!!subtitle && <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

export function EmptyState({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.lavenderSoft }]}><Ionicons name={icon} size={28} color={colors.lavender} /></View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.muted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.25, borderRadius: radius.md, padding: spacing.md, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5, elevation: 0 },
  button: { minHeight: 50, borderRadius: radius.sm, borderWidth: 1.25, borderColor: 'transparent', paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  buttonText: { fontFamily: type.bold, fontSize: 14 },
  titleRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontFamily: type.display, fontSize: 38, lineHeight: 40, letterSpacing: 0.2 },
  subtitle: { fontFamily: type.regular, fontSize: 14, marginTop: 3 },
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 28 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontFamily: type.semibold, fontSize: 18 },
  emptyBody: { fontFamily: type.regular, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
});
