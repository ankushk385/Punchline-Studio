import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeProvider';
import { type } from '@/theme/tokens';

const tabs = [
  { name: 'index', title: 'Home', icon: 'home-outline', active: 'home' },
  { name: 'ideas', title: 'Ideas', icon: 'bulb-outline', active: 'bulb' },
  { name: 'material', title: 'Material', icon: 'layers-outline', active: 'layers' },
  { name: 'perform', title: 'Perform', icon: 'play-outline', active: 'play' },
  { name: 'gigs', title: 'Gigs', icon: 'calendar-outline', active: 'calendar' },
] as const;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.nav,
          borderTopWidth: 1.5,
          borderTopColor: colors.border,
          elevation: 0,
          height: 64 + Math.max(insets.bottom, 12),
          paddingTop: 5,
          paddingBottom: Math.max(insets.bottom, 12),
        },
        tabBarLabelStyle: { fontFamily: type.medium, fontSize: 10.5 },
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
      <Tabs.Screen name="inbox" options={{ href: null }} />
      <Tabs.Screen name="setlist" options={{ href: null }} />
      <Tabs.Screen name="record" options={{ href: null }} />
    </Tabs>
  );
}
