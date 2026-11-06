import type { GuestPass } from '@safenest/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Body, Button, Card, Chip, Input, Label, Screen, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { errorMessage, supabase } from '../../src/lib/supabase';

const DURATIONS = [
  { label: '2 hours', hours: 2 },
  { label: '6 hours', hours: 6 },
  { label: 'Today + tonight', hours: 18 },
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
];

export default function NewPass() {
  const { active } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [plate, setPlate] = useState('');
  const [hours, setHours] = useState(6);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!active?.unit) return;
    if (!name.trim()) return Alert.alert('Guest name needed', 'Who is visiting?');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_guest_pass', {
      p_unit: active.unit.id,
      p_guest_name: name.trim(),
      p_valid_until: new Date(Date.now() + hours * 3600_000).toISOString(),
      p_guest_phone: phone.trim() || null,
      p_vehicle_plate: plate.trim() || null,
    });
    setBusy(false);
    if (error) return Alert.alert('Pass not created', errorMessage(error));
    router.replace(`/pass/${(data as GuestPass).id}`);
  };

  return (
    <Screen>
      <Title sub={active?.unit ? `For Unit ${active.unit.label}` : undefined}>New guest pass</Title>
      <Card>
        <Input label="Guest name" value={name} onChangeText={setName} placeholder="e.g. Sarah Nakato" autoFocus />
        <Input label="Guest phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0772 123 456" />
        <Input label="Vehicle plate (optional)" value={plate} onChangeText={setPlate} autoCapitalize="characters" placeholder="UBA 123X" />
        <Label>Valid for</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {DURATIONS.map((d) => (
            <Chip key={d.hours} label={d.label} selected={hours === d.hours} onPress={() => setHours(d.hours)} />
          ))}
        </View>
        <Body muted style={{ marginBottom: 16 }}>The pass works once. After the guard admits your guest it can't be reused.</Body>
        <Button title="Create pass" onPress={create} loading={busy} />
      </Card>
      <Button variant="ghost" title="Cancel" onPress={() => router.back()} />
    </Screen>
  );
}
