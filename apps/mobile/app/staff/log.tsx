import type { Unit, VisitorLog } from '@safenest/shared';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Badge, Body, Button, Card, Chip, Empty, Input, Label, Screen, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { fmtClock } from '../../src/lib/format';
import { api, errorMessage } from '../../src/lib/api';
import { useFocusPoll } from '../../src/lib/poll';

type Row = VisitorLog & { unit: { label: string } | null };

const METHOD: Record<VisitorLog['method'], string> = { pass_qr: 'QR', pass_code: 'Code', walk_in: 'Walk-in' };

export default function VisitorLogScreen() {
  const { active } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [units, setUnits] = useState<Pick<Unit, 'id' | 'label'>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', plate: '', unit: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const estateId = active?.estate.id;

  const load = async () => {
    if (!estateId) return;
    const data = await api<Row[]>(`/api/estates/${estateId}/visitors?days=1`).catch(() => null);
    if (data) setRows(data);
  };

  useFocusPoll(load, 15_000, [estateId]);

  useEffect(() => {
    if (!estateId) return;
    api<{ units: Pick<Unit, 'id' | 'label'>[] }>(`/api/estates/${estateId}`)
      .then((d) => setUnits(d.units))
      .catch(() => {});
  }, [estateId]);

  const logWalkIn = async () => {
    if (!estateId || !form.name.trim()) return Alert.alert('Name needed', "Enter the visitor's name.");
    setBusy(true);
    try {
      await api(`/api/estates/${estateId}/visitors`, {
        body: {
          guest_name: form.name,
          unit_id: form.unit || null,
          guest_phone: form.phone || null,
          vehicle_plate: form.plate || null,
          notes: form.notes || null,
        },
      });
      setForm({ name: '', phone: '', plate: '', unit: '', notes: '' });
      setShowForm(false);
      load();
    } catch (e) {
      Alert.alert('Not logged', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const exit = async (id: string) => {
    try {
      await api(`/api/visitors/${id}/exit`, { method: 'POST' });
      load();
    } catch (e) {
      Alert.alert('Not updated', errorMessage(e));
    }
  };

  const inside = rows.filter((r) => !r.exit_at).length;

  return (
    <Screen>
      <Title sub={`Last 24 hours · ${inside} inside now`}>Visitors</Title>

      {showForm ? (
        <Card>
          <Input label="Visitor name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
          <Input label="Phone (optional)" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} />
          <Input label="Vehicle plate (optional)" autoCapitalize="characters" value={form.plate} onChangeText={(plate) => setForm({ ...form, plate })} />
          <Label>Visiting unit</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {units.map((u) => (
              <Chip key={u.id} label={u.label} selected={form.unit === u.id} onPress={() => setForm({ ...form, unit: form.unit === u.id ? '' : u.id })} />
            ))}
          </View>
          <Input label="Notes (optional)" value={form.notes} onChangeText={(notes) => setForm({ ...form, notes })} placeholder="e.g. delivery, ID seen" />
          <Button title="Log entry" onPress={logWalkIn} loading={busy} />
          <Button variant="ghost" title="Cancel" onPress={() => setShowForm(false)} />
        </Card>
      ) : (
        <Button title="Log walk-in visitor" onPress={() => setShowForm(true)} style={{ marginBottom: 16 }} />
      )}

      {rows.length === 0 ? <Empty text="No visitors in the last 24 hours." /> : null}
      {rows.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Body style={{ fontWeight: '700', fontSize: 17, flex: 1 }}>{r.guest_name}</Body>
            <Badge label={METHOD[r.method]} tone={r.method === 'walk_in' ? 'amber' : 'green'} />
          </View>
          <Body muted style={{ marginTop: 4 }}>
            {r.unit ? `Unit ${r.unit.label} · ` : ''}In {fmtClock(r.entry_at)}
            {r.exit_at ? ` · Out ${fmtClock(r.exit_at)}` : ''}
            {r.vehicle_plate ? ` · ${r.vehicle_plate}` : ''}
          </Body>
          {!r.exit_at ? <Button variant="secondary" title="Check out" onPress={() => exit(r.id)} style={{ marginTop: 10 }} /> : null}
        </Card>
      ))}
    </Screen>
  );
}
