import type { GuestPass } from '@safenest/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Body, Button, Card, Empty, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { supabase } from '../../src/lib/supabase';
import { fmtTime, passTone } from '../../src/lib/format';
import { useTheme } from '../../src/lib/theme';

export default function Passes() {
  const { active } = useAuth();
  const router = useRouter();
  const { c } = useTheme();
  const [passes, setPasses] = useState<GuestPass[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!active?.unit) return;
    setLoading(true);
    const { data } = await supabase
      .from('guest_passes')
      .select('*')
      .eq('unit_id', active.unit.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setPasses((data as GuestPass[]) ?? []);
    setLoading(false);
  }, [active?.unit]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={c.primary} />}
      >
        <Title sub="Passes for your unit">Guests</Title>
        <Button title="New guest pass" onPress={() => router.push('/pass/new')} style={{ marginBottom: 16 }} />
        {passes.length === 0 && !loading ? <Empty text="No passes yet. Create one when you're expecting a visitor." /> : null}
        {passes.map((p) => {
          const { label, tone } = passTone(p);
          return (
            <Pressable key={p.id} onPress={() => router.push(`/pass/${p.id}`)}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Body style={{ fontWeight: '700', fontSize: 17 }}>{p.guest_name}</Body>
                  <Badge label={label} tone={tone} />
                </View>
                <Body muted style={{ marginTop: 6 }}>
                  Code {p.code} · until {fmtTime(p.valid_until)}
                  {p.vehicle_plate ? ` · ${p.vehicle_plate}` : ''}
                </Body>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
