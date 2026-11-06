import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Image, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Body, Button, Card, Empty, Title } from '../../src/components/ui';
import { API_URL, api, authHeaders, errorMessage } from '../../src/lib/api';
import { ago, categoryOf, type CommunityAlert } from '../../src/lib/community';
import { useFocusPoll } from '../../src/lib/poll';
import { useTheme } from '../../src/lib/theme';

/**
 * Neighbourhood alerts within 1 km. Police can't see these; a resident can turn one
 * into an SOS with "Send to police".
 */
export default function Community() {
  const router = useRouter();
  const { c } = useTheme();
  const [alerts, setAlerts] = useState<CommunityAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const here = useRef<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!here.current) {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const p = await Location.getLastKnownPositionAsync();
          if (p) here.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        }
      }
      const q = here.current ? `?lat=${here.current.lat}&lng=${here.current.lng}` : '';
      const d = await api<{ alerts: CommunityAlert[] }>(`/api/community${q}`);
      setAlerts(d.alerts);
    } catch {
      // keep the last list if offline
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusPoll(load, 30_000, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert('Not done', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const react = (a: CommunityAlert, kind: 'see_it_too' | 'all_clear') =>
    act(a.id, () => api(`/api/community/${a.id}/react`, { body: { kind: a.my_reaction === kind ? null : kind } }));

  const report = (a: CommunityAlert) =>
    Alert.alert('Report this post?', 'Report it if it is false, abusive or not a safety concern. Posts with several reports are hidden.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: () => act(a.id, () => api(`/api/community/${a.id}/report`, { body: {} })) },
    ]);

  const sendToPolice = (a: CommunityAlert) =>
    Alert.alert(
      'Send to police?',
      'This raises an SOS from you. The nearest police post gets the location, description and photo, and your estate guards are alerted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send to police', style: 'destructive',
          onPress: () => act(a.id, async () => {
            const r = await api<{ alert_id: string }>(`/api/community/${a.id}/send-to-police`, { method: 'POST' });
            router.push(`/sos/${r.alert_id}`);
          }),
        },
      ],
    );

  const resolve = (a: CommunityAlert) => act(a.id, () => api(`/api/community/${a.id}/remove`, { body: { status: 'resolved' } }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={c.primary} />}
      >
        <Title sub="Alerts from neighbours within 1 km">Neighbours</Title>
        <Button title="Alert my neighbours" onPress={() => router.push('/community/new')} style={{ marginBottom: 16 }} />

        {!alerts.length && !loading ? <Empty text="All quiet nearby. Post if you see something unusual." /> : null}

        {alerts.map((a) => {
          const cat = categoryOf(a.category);
          return (
            <Card key={a.id} style={a.status !== 'open' ? { opacity: 0.6 } : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 22 }}>{cat.emoji}</Text>
                <Body style={{ fontWeight: '800', fontSize: 17, flex: 1 }}>{cat.label}</Body>
                {a.sent_to_police ? <Badge label="police alerted" tone="red" /> : null}
                {a.status === 'resolved' ? <Badge label="resolved" tone="green" /> : null}
              </View>
              <Body style={{ marginTop: 8 }}>{a.message}</Body>
              {a.has_photo ? (
                <Image
                  source={{ uri: `${API_URL}/api/community/${a.id}/photo`, headers: authHeaders() }}
                  style={{ width: '100%', height: 200, borderRadius: 14, marginTop: 10 }}
                  resizeMode="cover"
                />
              ) : null}
              <Body muted style={{ marginTop: 8, fontSize: 13 }}>
                {a.mine ? 'You' : a.author}{a.estate_name ? ` · ${a.estate_name}` : ''} · {ago(a.created_at)} ·{' '}
                {a.distance_km < 1 ? `${Math.round(a.distance_km * 1000)} m away` : `${a.distance_km} km away`}
              </Body>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Pill label={`👀 I see it too · ${a.see_it_too}`} on={a.my_reaction === 'see_it_too'} onPress={() => react(a, 'see_it_too')} disabled={busy === a.id} />
                <Pill label={`✓ All clear · ${a.all_clear}`} on={a.my_reaction === 'all_clear'} onPress={() => react(a, 'all_clear')} disabled={busy === a.id} />
                <Pill label="Map" onPress={() => Linking.openURL(`https://maps.google.com/?q=${a.lat},${a.lng}`)} />
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {!a.sent_to_police && a.status === 'open' ? (
                  <Button variant="danger" title="Send to police" onPress={() => sendToPolice(a)} style={{ flex: 1 }} />
                ) : null}
                {a.mine && a.status === 'open' ? (
                  <Button variant="secondary" title="Mark resolved" onPress={() => resolve(a)} style={{ flex: 1 }} />
                ) : null}
              </View>
              {!a.mine && !a.i_reported ? (
                <Pressable onPress={() => report(a)} style={{ marginTop: 10 }}>
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>Report post</Text>
                </Pressable>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function Pill({ label, on, onPress, disabled }: { label: string; on?: boolean; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
        borderColor: on ? c.primary : c.border, backgroundColor: on ? c.tint : c.surface,
      }}
    >
      <Text style={{ color: on ? c.primaryDeep : c.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
