import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { registerForPush } from '../src/lib/push';
import { useTheme } from '../src/lib/theme';

/** Sends people to the right part of the app for their role. */
function Gate() {
  const { mode, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { c, dark } = useTheme();

  useEffect(() => {
    if (mode === 'loading') return;
    const group = segments[0];
    const target =
      mode === 'signed_out' ? '(auth)' : mode === 'unassigned' ? 'unassigned' : mode === 'resident' ? 'resident' : 'staff';
    // Shared screens (SOS details, pass details) are fine for anyone signed in.
    const shared = group === 'sos' || group === 'pass';
    if (group !== target && !(shared && mode !== 'signed_out')) {
      router.replace(target === '(auth)' ? '/login' : `/${target}`);
    }
  }, [mode, segments, router]);

  useEffect(() => {
    if (session?.user.id) registerForPush(session.user.id).catch(() => {});
  }, [session?.user.id]);

  // Tapping an SOS push opens the alert.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r.notification.request.content.data as { type?: string; alert_id?: string };
      if (data?.type === 'sos' && data.alert_id) router.push(`/sos/${data.alert_id}`);
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
