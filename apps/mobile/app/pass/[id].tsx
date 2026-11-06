import { qrPayload, type GuestPass } from '@safenest/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Badge, Body, Button, Card, Screen, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { fmtTime, passTone } from '../../src/lib/format';
import { errorMessage, supabase, WEB_URL } from '../../src/lib/supabase';
import { useTheme } from '../../src/lib/theme';

export default function PassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const { active } = useAuth();
  const [pass, setPass] = useState<GuestPass | null>(null);

  const load = async () => {
    const { data } = await supabase.from('guest_passes').select('*').eq('id', id).single();
    setPass(data as GuestPass);
  };
  useEffect(() => { load(); }, [id]);

  if (!pass) return <Screen><Body muted>Loading…</Body></Screen>;
  const { label, tone } = passTone(pass);
  const live = label === 'active';

  const share = () => {
    const link = WEB_URL ? `\n\nShow this at the gate: ${WEB_URL}/p/${pass.qr_token}` : '';
    Share.share({
      message:
        `Hi ${pass.guest_name}, here's your SafeNest gate pass for ${active?.estate.name ?? 'the estate'}` +
        `${active?.unit ? `, Unit ${active.unit.label}` : ''}.\n\n` +
        `Gate code: ${pass.code}\nValid until: ${fmtTime(pass.valid_until)}\nIt works once.${link}`,
    });
  };

  const revoke = () =>
    Alert.alert('Cancel this pass?', 'The guard will not be able to admit this guest with it.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel pass', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('revoke_guest_pass', { p_pass: pass.id });
          if (error) Alert.alert('Could not cancel', errorMessage(error));
          else load();
        },
      },
    ]);

  return (
    <Screen>
      <Title sub={`Until ${fmtTime(pass.valid_until)}`}>{pass.guest_name}</Title>
      <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
        <Badge label={label} tone={tone} />
        <View style={{ padding: 16, backgroundColor: '#fff', borderRadius: 20, marginVertical: 20, opacity: live ? 1 : 0.25 }}>
          <QRCode value={qrPayload(pass.qr_token)} size={200} color="#064E3B" backgroundColor="#fff" />
        </View>
        <Text style={{ fontSize: 13, color: c.textMuted, fontWeight: '600' }}>GATE CODE</Text>
        <Text style={{ fontSize: 40, fontWeight: '900', letterSpacing: 8, color: c.text, marginTop: 4 }}>{pass.code}</Text>
        {pass.vehicle_plate ? <Body muted style={{ marginTop: 6 }}>Vehicle {pass.vehicle_plate}</Body> : null}
      </Card>
      {live ? (
        <>
          <Button title="Share with guest" onPress={share} />
          <Button variant="ghost" title="Cancel pass" onPress={revoke} style={{ marginTop: 8 }} />
        </>
      ) : null}
      <Button variant="secondary" title="Done" onPress={() => router.back()} style={{ marginTop: 8 }} />
    </Screen>
  );
}
