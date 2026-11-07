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
  const { signIn, completePin } = useAuth();
  const [pinStep, setPinStep] = useState<{ mode: 'setup' | 'enter'; pending: string } | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
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
      const step = await signIn(phone, token);
      if (step) {
        setPinStep(step);
        setBusy(false);
      }
      // Otherwise the root layout now routes to the right home screen.
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  const submitPin = async () => {
    if (!pinStep) return;
    if (pinStep.mode === 'setup' && pin !== pin2) return setErr('The two PINs do not match');
    setBusy(true);
    setErr(null);
    try {
      await completePin(pinStep.pending, pin);
    } catch (e) {
      setErr(errorMessage(e));
      setPin('');
      setPin2('');
      setBusy(false);
    }
  };

  if (pinStep) {
    const pinStyle = { fontSize: 28, letterSpacing: 10, textAlign: 'center' as const };
    return (
      <Screen>
        <Title sub={pinStep.mode === 'setup' ? 'Your account can see sensitive information' : 'Second step'}>
          {pinStep.mode === 'setup' ? 'Choose a PIN' : 'Enter your PIN'}
        </Title>
        <Card>
          {pinStep.mode === 'setup' ? (
            <Body muted style={{ marginBottom: 12 }}>
              Choose 4–6 digits you don't use anywhere else. You'll enter it each time you sign in. Never share it.
            </Body>
          ) : null}
          <Input label={pinStep.mode === 'setup' ? 'New PIN' : 'PIN'} value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))}
            keyboardType="number-pad" secureTextEntry maxLength={6} style={pinStyle} autoFocus />
          {pinStep.mode === 'setup' ? (
            <Input label="Type it again" value={pin2} onChangeText={(v) => setPin2(v.replace(/\D/g, ''))}
              keyboardType="number-pad" secureTextEntry maxLength={6} style={pinStyle} />
          ) : null}
          {err ? <Body style={{ color: c.sos, marginBottom: 12 }}>{err}</Body> : null}
          <Button title={pinStep.mode === 'setup' ? 'Save PIN and sign in' : 'Sign in'} onPress={submitPin} loading={busy} disabled={pin.length < 4} />
        </Card>
      </Screen>
    );
  }

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
