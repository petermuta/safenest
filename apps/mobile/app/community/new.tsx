import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { Body, Button, Card, Chip, Input, Label, Screen, Title } from '../../src/components/ui';
import { api, errorMessage } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { CATEGORIES } from '../../src/lib/community';
import { getFix } from '../../src/lib/sos';

/** Post a neighbourhood alert to everyone within about 1 km. */
export default function NewCommunityAlert() {
  const router = useRouter();
  const { active } = useAuth();
  const [category, setCategory] = useState('suspicious_person');
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; mime?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Camera blocked', 'Allow camera access in Settings to add a photo.');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (!res.canceled && res.assets[0]) setPhoto({ uri: res.assets[0].uri, mime: res.assets[0].mimeType });
  };

  const post = async () => {
    if (!active) return;
    if (message.trim().length < 3) return Alert.alert('Add a description', 'Say briefly what is happening.');
    setBusy(true);
    try {
      const fix = await getFix(active);
      const form = new FormData();
      form.append('category', category);
      form.append('message', message.trim());
      form.append('lat', String(fix.lat));
      form.append('lng', String(fix.lng));
      if (photo) form.append('photo', { uri: photo.uri, name: 'photo.jpg', type: photo.mime ?? 'image/jpeg' } as unknown as Blob);
      const r = await api<{ notified: number }>('/api/community', { form });
      Alert.alert('Posted', r.notified ? `${r.notified} neighbour${r.notified === 1 ? '' : 's'} notified.` : 'Your neighbours can see it now.');
      router.back();
    } catch (e) {
      Alert.alert('Not posted', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title sub="Neighbours within about 1 km will see this. Police won't, unless someone taps “Send to police”.">
        Alert my neighbours
      </Title>
      <Card>
        <Label>What is it?</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c.key} label={`${c.emoji} ${c.label}`} selected={category === c.key} onPress={() => setCategory(c.key)} />
          ))}
        </View>
        <Input label="What's happening?" value={message} onChangeText={setMessage} multiline maxLength={500}
          placeholder="e.g. Two men checking car doors on Lane 3" style={{ minHeight: 90, textAlignVertical: 'top' }} />
        {photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 180, borderRadius: 14, marginBottom: 12 }} /> : null}
        <Button variant="secondary" title={photo ? 'Retake photo' : 'Add a photo (only if safe)'} onPress={takePhoto} style={{ marginBottom: 12 }} />
        <Body muted style={{ marginBottom: 12 }}>Your current location is attached. Don't put yourself at risk to take a photo.</Body>
        <Button title="Post alert" onPress={post} loading={busy} />
      </Card>
      <Button variant="ghost" title="Cancel" onPress={() => router.back()} />
    </Screen>
  );
}
