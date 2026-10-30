import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeProvider';
import { type } from '@/theme/tokens';

const tabs = [
  { name: 'index', title: 'Home', icon: 'home-outline', active: 'home' },
  { name: 'inbox', title: 'Inbox', icon: 'mail-outline', active: 'mail' },
  { name: 'setlist', title: 'Setlists', icon: 'list-outline', active: 'list' },
  { name: 'gigs', title: 'Gigs', icon: 'calendar-outline', active: 'calendar' },
  { name: 'record', title: 'Record', icon: 'mic-outline', active: 'mic' },
] as const;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.nav,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          elevation: 0,
          height: 64 + Math.max(insets.bottom, 12),
          paddingTop: 5,
          paddingBottom: Math.max(insets.bottom, 12),
        },
        tabBarLabelStyle: { fontFamily: type.medium, fontSize: 10.5 },
        tabBarBackground: () => Platform.OS === 'ios'
          ? <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.nav }]} />,
      }}
    >
      {tabs.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={(focused ? tab.active : tab.icon) as keyof typeof Ionicons.glyphMap} size={22} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
