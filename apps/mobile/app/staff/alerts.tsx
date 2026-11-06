import type { SosAlert } from '@safenest/shared';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Badge, Body, Button, Card, Empty, Screen, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { fmtTime } from '../../src/lib/format';
import { supabase } from '../../src/lib/supabase';

type Row = SosAlert & {
  resident: { full_name: string | null } | null;
  unit: { label: string } | null;
};

export default function Alerts() {
  const { active, signOut, profile } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const estateId = active?.estate.id;

  const load = useCallback(async () => {
    if (!estateId) return;
    const { data } = await supabase
      .from('sos_alerts')
      .select('*, resident:profiles!sos_alerts_user_id_fkey(full_name), unit:units(label)')
      .eq('estate_id', estateId)
      .order('created_at', { ascending: false })
      .limit(30);
    setRows((data as Row[]) ?? []);
  }, [estateId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!estateId) return;
    const ch = supabase
      .channel(`alerts-${estateId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_alerts', filter: `estate_id=eq.${estateId}` }, () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        load();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sos_alerts', filter: `estate_id=eq.${estateId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [estateId, load]);

  const open = rows.filter((r) => r.status === 'active' || r.status === 'acknowledged');
  const closed = rows.filter((r) => !open.includes(r));

  const item = (r: Row) => (
    <Pressable key={r.id} onPress={() => router.push(`/sos/${r.id}`)}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Body style={{ fontWeight: '700', fontSize: 17, flex: 1 }}>
            {r.resident?.full_name ?? 'Resident'}{r.unit ? ` · ${r.unit.label}` : ''}
          </Body>
          <Badge
            label={r.status.replace('_', ' ')}
            tone={r.status === 'active' ? 'red' : r.status === 'acknowledged' ? 'amber' : 'grey'}
          />
        </View>
        <Body muted style={{ marginTop: 4 }}>{fmtTime(r.created_at)}</Body>
      </Card>
    </Pressable>
  );

  return (
    <Screen>
      <Title sub={`${active?.estate.name ?? ''} · ${active?.role === 'manager' ? 'Manager' : 'Guard'}`}>SOS alerts</Title>
      {open.length === 0 ? <Empty text="No open alerts. You'll get a loud notification if a resident raises one." /> : open.map(item)}
      {closed.length ? <Body muted style={{ marginVertical: 8 }}>Earlier</Body> : null}
      {closed.map(item)}
      <Body muted style={{ marginTop: 16, textAlign: 'center' }}>Signed in as {profile?.full_name ?? profile?.phone}</Body>
      <Button variant="ghost" title="Sign out" onPress={signOut} />
    </Screen>
  );
}
