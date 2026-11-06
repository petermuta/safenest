import { parseQrPayload, type PassVerification } from '@safenest/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Input, Screen, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { fmtTime } from '../../src/lib/format';
import { api, errorMessage } from '../../src/lib/api';
import { useTheme } from '../../src/lib/theme';

const REASONS: Record<PassVerification['reason'], string> = {
  valid: 'Let them in',
  not_found: 'No such pass at this estate',
  already_used: 'This pass has already been used',
  expired: 'This pass has expired',
  not_yet_valid: 'This pass is not valid yet',
  revoked: 'The resident cancelled this pass',
};

export default function GateVerify() {
  const { active } = useAuth();
  const { c } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PassVerification | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const locked = useRef(false);

  const verify = async (input: string) => {
    if (!active || locked.current) return;
    locked.current = true;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<PassVerification>('/api/gate/verify', { body: { estate_id: active.estate.id, input } });
      setResult(r);
      Haptics.notificationAsync(r.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    } catch (e) {
      setErr(errorMessage(e));
    }
    setBusy(false);
    setScanning(false);
    setCode('');
    setTimeout(() => { locked.current = false; }, 1200);
  };

  const startScan = async () => {
    setResult(null);
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) return setErr('Allow camera access in Settings to scan passes.');
    }
    setScanning(true);
  };

  return (
    <Screen>
      <Title sub={active?.estate.name}>Gate check</Title>

      {result ? (
        <View
          style={{
            backgroundColor: result.ok ? c.primaryDeep : c.sos, borderRadius: 26, padding: 24, marginBottom: 16,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', opacity: 0.9 }}>
            {result.ok ? '✓ VALID PASS' : '✕ DO NOT ADMIT'}
          </Text>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 6 }}>
            {result.guest_name ?? REASONS[result.reason]}
          </Text>
          {result.guest_name ? (
            <Text style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>{REASONS[result.reason]}</Text>
          ) : null}
          {result.unit_label ? <Text style={{ color: '#fff', fontSize: 16, marginTop: 10 }}>Visiting Unit {result.unit_label}</Text> : null}
          {result.vehicle_plate ? <Text style={{ color: '#fff', fontSize: 16 }}>Vehicle {result.vehicle_plate}</Text> : null}
          {result.valid_until && !result.ok ? (
            <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>Valid until {fmtTime(result.valid_until)}</Text>
          ) : null}
          <Button variant="secondary" title="Next guest" onPress={() => setResult(null)} style={{ marginTop: 16 }} />
        </View>
      ) : null}

      {scanning ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <CameraView
            style={{ height: 320 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              const token = parseQrPayload(data);
              if (token) verify(token);
              else setErr('That QR code is not a SafeNest pass.');
            }}
          />
          <Button variant="ghost" title="Stop scanning" onPress={() => setScanning(false)} />
        </Card>
      ) : (
        <Button title="Scan QR pass" onPress={startScan} style={{ marginBottom: 16 }} />
      )}

      <Card>
        <Input
          label="Or type the 6-digit code"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="123456"
          style={{ fontSize: 26, letterSpacing: 8, textAlign: 'center' }}
        />
        <Button title="Check code" onPress={() => verify(code)} loading={busy} disabled={code.length !== 6} />
      </Card>
      {err ? <Body style={{ color: c.sos }}>{err}</Body> : null}
    </Screen>
  );
}
