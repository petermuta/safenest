import { formatUgPhone } from '@safenest/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Body, Button, Card, Input, Screen, Title } from '../../src/components/ui';
import { api, errorMessage } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { useTheme } from '../../src/lib/theme';

export default function Verify() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(60);

  useEffect(() => {
    const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const verify = async (token = code) => {
    if (token.length !== 6) return;
    setBusy(true);
    setErr(null);
    try {
      await signIn(phone, token);
      // The root layout now routes to the right home screen.
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  const resend = async () => {
    setWait(60);
    await api('/api/auth/otp', { body: { phone } }).catch((e) => setErr(errorMessage(e)));
  };

  return (
    <Screen>
      <Title sub={`Sent to ${formatUgPhone(phone ?? '')}`}>Enter your code</Title>
      <Card>
        <Input
          placeholder="••••••"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={6}
          value={code}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '');
            setCode(digits);
            if (digits.length === 6) verify(digits);
          }}
          style={{ fontSize: 28, letterSpacing: 10, textAlign: 'center' }}
          autoFocus
        />
        {err ? <Body style={{ color: c.sos, marginBottom: 12 }}>{err}</Body> : null}
        <Button title="Verify" onPress={() => verify()} loading={busy} disabled={code.length !== 6} />
      </Card>
      <Button
        variant="ghost"
        title={wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
        onPress={resend}
        disabled={wait > 0}
      />
      <Button variant="ghost" title="Change number" onPress={() => router.back()} />
    </Screen>
  );
}
