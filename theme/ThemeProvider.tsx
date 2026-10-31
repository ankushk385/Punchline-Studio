import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { AppColors, dayColors, lateColors, resolveTheme, ResolvedTheme, ThemeMode } from './tokens';
import { setInterfaceSoundsEnabled } from '@/lib/interface-sounds';

const THEME_KEY = '@standup:theme-mode';
const HAPTICS_KEY = '@standup:haptics-enabled';
const SOUNDS_KEY = '@standup:sounds-enabled';

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  colors: AppColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  hapticsEnabled: boolean;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
  soundsEnabled: boolean;
  setSoundsEnabled: (enabled: boolean) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemTheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [hapticsEnabled, setHapticsState] = useState(true);
  const [soundsEnabled, setSoundsState] = useState(true);

  useEffect(() => {
    AsyncStorage.multiGet([THEME_KEY, HAPTICS_KEY, SOUNDS_KEY]).then(values => {
      const storedMode = values[0][1];
      if (storedMode === 'day' || storedMode === 'late' || storedMode === 'system') setModeState(storedMode);
      // Backward-compatible migration from StandUp Companion appearance values.
      if (storedMode === 'light') setModeState('day');
      if (storedMode === 'dark') setModeState('late');
      if (values[1][1] !== null) setHapticsState(values[1][1] === 'true');
      if (values[2][1] !== null) setSoundsState(values[2][1] === 'true');
    }).catch(error => console.warn('Could not load appearance preferences', error));
  }, []);

  useEffect(() => { setInterfaceSoundsEnabled(soundsEnabled); }, [soundsEnabled]);

  const resolvedTheme: ResolvedTheme = resolveTheme(mode, systemTheme);
  const colors = resolvedTheme === 'late' ? lateColors : dayColors;

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    resolvedTheme,
    colors,
    isDark: resolvedTheme === 'late',
    setMode: async (next) => {
      setModeState(next);
      await AsyncStorage.setItem(THEME_KEY, next);
    },
    hapticsEnabled,
    setHapticsEnabled: async (enabled) => {
      setHapticsState(enabled);
      await AsyncStorage.setItem(HAPTICS_KEY, String(enabled));
    },
    soundsEnabled,
    setSoundsEnabled: async (enabled) => {
      setSoundsState(enabled);
      await AsyncStorage.setItem(SOUNDS_KEY, String(enabled));
    },
  }), [colors, hapticsEnabled, mode, resolvedTheme, soundsEnabled]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}
