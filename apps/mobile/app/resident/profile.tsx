import { formatUgPhone } from '@safenest/shared';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Body, Button, Card, Input, Label, Screen, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { errorMessage, supabase } from '../../src/lib/supabase';

export default function Profile() {
  const { profile, active, memberships, refresh, signOut } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() || null }).eq('id', profile.id);
    setBusy(false);
    if (error) return Alert.alert('Not saved', errorMessage(error));
    await refresh();
    Alert.alert('Saved', 'Your name has been updated.');
  };

  return (
    <Screen>
      <Title sub={formatUgPhone(profile?.phone ?? '')}>Profile</Title>
      <Card>
        <Input label="Your name" value={name} onChangeText={setName} placeholder="As your guards should know you" />
        <Button title="Save" onPress={save} loading={busy} />
      </Card>
      <Card tinted>
        <Label>Your estates</Label>
        {memberships.map((m) => (
          <Body key={m.id} style={{ marginBottom: 4 }}>
            {m.estate.name} — {m.role}
            {m.unit ? ` · Unit ${m.unit.label}` : ''}
            {m.id === active?.id ? ' (current)' : ''}
          </Body>
        ))}
      </Card>
      <Button variant="secondary" title="Sign out" onPress={signOut} />
    </Screen>
  );
}
