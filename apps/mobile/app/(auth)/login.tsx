import { normalizeUgPhone } from '@safenest/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Body, Button, Card, Input, Screen } from '../../src/components/ui';
import { errorMessage, supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/lib/theme';

export default function Login() {
  const router = useRouter();
  const { c } = useTheme();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    const phone = normalizeUgPhone(raw);
    if (!phone) return setErr('Enter a Ugandan mobile number, e.g. 0772 123 456');
    setErr(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    router.push({ pathname: '/verify', params: { phone } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <LinearGradient
          colors={c.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 28, padding: 28, marginTop: 24, marginBottom: 24 }}
        >
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Text style={{ fontSize: 28 }}>🛡️</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -0.5 }}>SafeNest</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 6 }}>
            Your estate, your gate, your safety — in one app.
          </Text>
        </LinearGradient>

        <Card>
          <Input
            label="Phone number"
            placeholder="0772 123 456"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            value={raw}
            onChangeText={setRaw}
            onSubmitEditing={send}
          />
          {err ? <Body style={{ color: c.sos, marginBottom: 12 }}>{err}</Body> : null}
          <Button title="Send code" onPress={send} loading={busy} />
        </Card>
        <Body muted style={{ textAlign: 'center' }}>We'll text you a 6-digit code. Standard SMS rates may apply.</Body>
      </Screen>
    </KeyboardAvoidingView>
  );
}
