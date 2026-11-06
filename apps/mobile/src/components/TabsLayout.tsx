import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { elevation, useTheme } from '../lib/theme';

type Icon = ComponentProps<typeof Ionicons>['name'];

/** Floating, rounded tab bar shared by the resident and staff apps. */
export function TabsLayout({ tabs }: { tabs: { name: string; title: string; icon: Icon }[] }) {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 20,
          height: 66,
          paddingTop: 8,
          paddingBottom: 10,
          borderRadius: 24,
          borderTopWidth: 0,
          backgroundColor: c.surfaceRaised,
          ...elevation(c.shadow, 3),
        },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={String(color)} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
