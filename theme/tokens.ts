export type ThemeMode = 'day' | 'late' | 'system';
export type ResolvedTheme = 'day' | 'late';
export function resolveTheme(mode: ThemeMode, system: 'light' | 'dark' | null | undefined): ResolvedTheme {
  return mode === 'system' ? (system === 'light' ? 'day' : 'late') : mode;
}

const shared = {
  white: '#FFFFFF',
  black: '#000000',
};

export const dayColors = {
  ...shared,
  background: '#FFFDF8', card: '#FFFDF8', surface: '#F4F1EA', raised: '#FFFFFF',
  text: '#111111', muted: '#5D5A55', subtle: '#817D75', border: '#111111', input: '#FFFFFF', nav: '#FFFDF8',
  blue: '#3157D5', blueSoft: '#E4EAFC', gold: '#F3C623', goldSoft: '#FFF5BE',
  mint: '#BFE3CE', mintStrong: '#277A56', mintSoft: '#E6F4EC', red: '#F04438', redSoft: '#FFE5E2',
  amber: '#3157D5', amberSoft: '#E4EAFC', lavender: '#3157D5', lavenderSoft: '#E4EAFC', warning: '#A67600',
  onAccent: '#FFFFFF', shadow: '#111111', teleprompter: '#111111', teleprompterText: '#FFFDF8', focus: '#3157D5',
};

export const lateColors = {
  ...shared,
  background: '#071426', card: '#101F38', surface: '#162944', raised: '#101F38',
  text: '#F6F2E8', muted: '#B8C2D4', subtle: '#8292AA', border: '#34516F', input: '#101F38', nav: '#071426',
  blue: '#4D7CFE', blueSoft: '#18366D', gold: '#FFC84A', goldSoft: '#493B16',
  mint: '#75D6B0', mintStrong: '#75D6B0', mintSoft: '#173F38', red: '#FF5148', redSoft: '#49242A',
  amber: '#4D7CFE', amberSoft: '#18366D', lavender: '#4D7CFE', lavenderSoft: '#18366D', warning: '#FFC84A',
  onAccent: '#FFFFFF', shadow: '#000000', teleprompter: '#030A14', teleprompterText: '#F6F2E8', focus: '#4D7CFE',
};

export const lightColors = dayColors;
export const darkColors = lateColors;
export type AppColors = typeof dayColors;

export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 } as const;
export const radius = { sm: 3, md: 5, lg: 7, xl: 10, pill: 999 } as const;
export const type = {
  display: 'BebasNeue_400Regular',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
