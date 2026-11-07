import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Input, Label, Screen, Title } from '../src/components/ui';
import { api, errorMessage } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { raiseSos, smsFallback } from '../src/lib/sos';
import { useTheme } from '../src/lib/theme';

/**
 * Resident onboarding: (1) full name + NIN with consent, (2) a live selfie from the
 * front camera — taken now, not picked from the photo library.
 */
export default function Onboarding() {
  const { profile, identity, active, refresh, signOut } = useAuth();
  const { c } = useTheme();
  const router = useRouter();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [nin, setNin] = useState('');
  const [consent, setConsent] = useState(false);
  const [adult, setAdult] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; mime?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sosBusy, setSosBusy] = useState(false);

  const step = identity?.has_nin ? 2 : 1;

  const saveNin = async () => {
    if (!consent) return Alert.alert('Consent needed', 'Tick the box to agree to share your NIN.');
    if (!adult) return Alert.alert('18 or older only', 'SafeNest accounts are for adults. A parent or guardian in your home can register instead.');
    setBusy(true);
    try {
      await api('/api/me/identity', { body: { full_name: name, nin, consent: true, adult: true } });
      await refresh();
    } catch (e) {
      Alert.alert('Not saved', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const takeSelfie = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Camera needed', 'Allow camera access in Settings to take your photo.');
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!res.canceled && res.assets[0]) setPhoto({ uri: res.assets[0].uri, mime: res.assets[0].mimeType });
  };

  const uploadSelfie = async () => {
    if (!photo) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('photo', { uri: photo.uri, name: 'selfie.jpg', type: photo.mime ?? 'image/jpeg' } as unknown as Blob);
      await api('/api/me/selfie', { form });
      await refresh(); // the root layout now opens the resident home screen
    } catch (e) {
      Alert.alert('Upload failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const emergency = async () => {
    if (!active) return;
    setSosBusy(true);
    try {
      const { alertId } = await raiseSos(active);
      router.push(`/sos/${alertId}`);
    } catch (e) {
      const sent = await smsFallback(active).catch(() => false);
      Alert.alert('Could not reach SafeNest', sent ? 'We opened an SMS to your gate. Send it, and call 999.' : `${errorMessage(e)}\n\nCall 999.`);
    } finally {
      setSosBusy(false);
    }
  };

  return (
    <Screen>
      <Title sub={`Step ${step} of 2 · ${active?.estate.name ?? ''}`}>Verify your identity</Title>

      <Card tinted>
        <Body>
          So police can identify you quickly in an emergency, SafeNest needs your National ID Number (NIN) and a photo of
          you. Your NIN is stored encrypted. Only police can see it in full, and every time they do it is recorded.
        </Body>
      </Card>

      {step === 1 ? (
        <Card>
          <Input label="Full name (as on your National ID)" value={name} onChangeText={setName} autoCapitalize="words" />
          <Input label="NIN" value={nin} onChangeText={(v) => setNin(v.toUpperCase())} autoCapitalize="characters"
            autoCorrect={false} placeholder="CM12345678ABCD" maxLength={20} />
          <Check checked={consent} onPress={() => setConsent(!consent)} color={c.primary}>
            I agree to SafeNest storing my NIN and photo and sharing them with the police when I raise an SOS or when
            police search for me. I understand this data is stored on secure servers outside Uganda (in the United States),
            and that I can delete my account at any time from my profile.
          </Check>
          <Check checked={adult} onPress={() => setAdult(!adult)} color={c.primary}>
            I am 18 years or older.
          </Check>
          <Button title="Continue" onPress={saveNin} loading={busy} disabled={!consent || !adult || nin.length < 14 || name.trim().length < 3} />
        </Card>
      ) : (
        <Card style={{ alignItems: 'center' }}>
          <Label>NIN saved: {identity?.nin_masked}</Label>
          {photo ? (
            <Image source={{ uri: photo.uri }} style={{ width: 200, height: 200, borderRadius: 100, marginVertical: 16 }} />
          ) : (
            <View style={{ width: 200, height: 200, borderRadius: 100, marginVertical: 16, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 64 }}>🙂</Text>
            </View>
          )}
          <Body muted style={{ textAlign: 'center', marginBottom: 16 }}>
            Take a clear photo of your face in good light. No hats or sunglasses.
          </Body>
          <Button title={photo ? 'Retake photo' : 'Take my photo'} variant={photo ? 'secondary' : 'primary'} onPress={takeSelfie} style={{ alignSelf: 'stretch' }} />
          {photo ? <Button title="Use this photo" onPress={uploadSelfie} loading={busy} style={{ alignSelf: 'stretch', marginTop: 10 }} /> : null}
        </Card>
      )}

      <Card>
        <Label>In an emergency right now?</Label>
        <Button variant="danger" title={sosBusy ? 'Sending SOS…' : 'Send SOS now'} onPress={emergency} loading={sosBusy} />
      </Card>
      <Button variant="ghost" title="Sign out" onPress={signOut} />
    </Screen>
  );
}

function Check({ checked, onPress, color, children }: { checked: boolean; onPress: () => void; color: string; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
      <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: color, backgroundColor: checked ? color : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {checked ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}
      </View>
      <Body style={{ flex: 1 }}>{children}</Body>
    </Pressable>
  );
}
