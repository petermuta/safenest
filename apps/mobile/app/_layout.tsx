import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { WEB_URL } from '../src/lib/api';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { registerForPush } from '../src/lib/push';
import { useTheme } from '../src/lib/theme';

/** Sends people to the right part of the app for their role. */
function Gate() {
  const { mode, userId } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { c, dark } = useTheme();

  useEffect(() => {
    if (mode === 'loading') return;
    const group = segments[0];
    const target = mode === 'signed_out' ? '(auth)' : mode;
    // Shared screens (SOS details, passes, community posts) are fine for anyone set up.
    const shared =
      ((group === 'pass' || group === 'community') && (mode === 'resident' || mode === 'staff')) ||
      // SOS is never blocked — including for residents who haven't finished onboarding.
      (group === 'sos' && (mode === 'resident' || mode === 'staff' || mode === 'onboarding'));
    if (group !== target && !shared) {
      router.replace(target === '(auth)' ? '/login' : `/${target}`);
    }
  }, [mode, segments, router]);

  useEffect(() => {
    if (userId) registerForPush().catch(() => {});
  }, [userId]);

  // Tapping an SOS push opens the alert.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r.notification.request.content.data as { type?: string; alert_id?: string };
      if (data?.type === 'sos' && data.alert_id) router.push(`/sos/${data.alert_id}`);
      if (data?.type === 'community') router.push('/resident/community');
      if (data?.type === 'police_sos' && data.alert_id) Linking.openURL(`${WEB_URL}/police/alerts/${data.alert_id}`);
    });
    return () => sub.remove();
  }, [router]);

  if (mode === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
        <Stack.Screen name="pass/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="community/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sos/[id]" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
