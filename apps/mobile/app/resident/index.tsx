import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { SOSButton } from '../../src/components/SOSButton';
import { Badge, Body, Button, Card, Screen, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { raiseSos, smsFallback } from '../../src/lib/sos';
import { errorMessage } from '../../src/lib/supabase';

export default function ResidentHome() {
  const { active, profile } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!active) return null;
  const firstName = profile?.full_name?.split(' ')[0];

  const trigger = async () => {
    setBusy(true);
    try {
      const { alertId } = await raiseSos(active);
      router.push(`/sos/${alertId}`);
    } catch (e) {
      // Most likely no data connection. Fall back to SMS from the phone.
      const sent = await smsFallback(active).catch(() => false);
      Alert.alert(
        'Could not reach SafeNest',
        sent
          ? 'We opened an SMS to your gate. Send it, and call 999 if you are in danger.'
          : `${errorMessage(e)}\n\nCall 999 if you are in danger.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title sub={`${active.estate.name}${active.unit ? ` · Unit ${active.unit.label}` : ''}`}>
        {firstName ? `Hi, ${firstName}` : 'Welcome home'}
      </Title>

      <Card style={{ alignItems: 'center', paddingVertical: 8 }}>
        <SOSButton onTrigger={trigger} busy={busy} />
        <Body muted style={{ textAlign: 'center', marginBottom: 12, paddingHorizontal: 12 }}>
          Hold for 1.5 seconds. Your guards, estate manager and the nearest police station get your location
          immediately.
        </Body>
      </Card>

      <Card tinted>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Body style={{ fontWeight: '700', fontSize: 17 }}>Expecting someone?</Body>
          <Badge label="One-time" />
        </View>
        <Body muted style={{ marginBottom: 14 }}>
          Create a guest pass. Your visitor shows the code or QR at the gate and it works once.
        </Body>
        <Button title="New guest pass" onPress={() => router.push('/pass/new')} />
      </Card>
    </Screen>
  );
}
