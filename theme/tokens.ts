export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const shared = {
  amber: '#FFB900',
  lavender: '#9874E2',
  mint: '#11A98A',
  red: '#ED5160',
  warning: '#E99A00',
  onAccent: '#151525',
  white: '#FFFFFF',
  black: '#000000',
};

export const lightColors = {
  ...shared,
  background: '#F8F7F4',
  card: '#FFFFFF',
  surface: '#F3F2F7',
  text: '#151525',
  muted: '#6C7184',
  subtle: '#9296A6',
  border: '#E7E5EC',
  input: '#FFFFFF',
  nav: 'rgba(255,255,255,0.96)',
  lavender: '#9874E2',
  lavenderSoft: '#EEE8FB',
  amberSoft: '#FFF3CC',
  mint: '#11A98A',
  mintSoft: '#DDF5EE',
  red: '#ED5160',
  redSoft: '#FDE7EA',
  shadow: '#27233A',
  teleprompter: '#171820',
  teleprompterText: '#F9F8FE',
};

export const darkColors = {
  ...shared,
  background: '#14151E',
  card: '#222331',
  surface: '#2A2B3B',
  text: '#F9F8FE',
  muted: '#A2A5BA',
  subtle: '#74778E',
  border: '#37384B',
  input: '#2A2B3B',
  nav: 'rgba(20,21,30,0.96)',
  amber: '#FFBC0B',
  lavender: '#AB77EE',
  lavenderSoft: '#32264C',
  amberSoft: '#453913',
  mint: '#25C99B',
  mintSoft: '#173E37',
  red: '#FB636C',
  redSoft: '#48252E',
  shadow: '#000000',
  teleprompter: '#0D0E14',
  teleprompterText: '#F9F8FE',
};

export type AppColors = typeof lightColors;

export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 } as const;
export const type = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
