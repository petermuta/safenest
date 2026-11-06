import { formatUgPhone, SOS_BUCKET, type SosAlert, type SosEvidence, type SosStatus } from '@safenest/shared';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { Badge, Body, Button, Card, Label, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { fmtClock } from '../../src/lib/format';
import { uploadEvidence } from '../../src/lib/sos';
import { errorMessage, supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/lib/theme';

type AlertRow = SosAlert & {
  resident: { full_name: string | null; phone: string } | null;
  unit: { label: string } | null;
  estate: { name: string } | null;
};

const AUDIO_CHUNK_MS = 30_000;
const AUDIO_MAX_CHUNKS = 10; // 5 minutes

export default function SosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const { c } = useTheme();
  const [alert, setAlert] = useState<AlertRow | null>(null);
  const [evidence, setEvidence] = useState<SosEvidence[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const load = useCallback(async () => {
    const [{ data: a }, { data: ev }] = await Promise.all([
      supabase
        .from('sos_alerts')
        .select('*, resident:profiles!sos_alerts_user_id_fkey(full_name, phone), unit:units(label), estate:estates(name)')
        .eq('id', id)
        .single(),
      supabase.from('sos_evidence').select('*').eq('alert_id', id).order('created_at'),
    ]);
    setAlert(a as AlertRow);
    setEvidence((ev as SosEvidence[]) ?? []);
  }, [id]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`sos-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts', filter: `id=eq.${id}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_evidence', filter: `alert_id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  const mine = !!alert && alert.user_id === session?.user.id;
  const open = alert?.status === 'active' || alert?.status === 'acknowledged';

  // ---------------------------------------------------------- silent audio evidence
  // Records in 30s chunks and uploads each one, so evidence survives even if the
  // phone is taken or switched off part-way. No sounds are played. The OS still
  // shows its microphone indicator — that can't (and shouldn't) be hidden.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const stopFlag = useRef(false);
  const started = useRef(false);

  const recordChunks = useCallback(async () => {
    for (let i = 0; i < AUDIO_MAX_CHUNKS && !stopFlag.current; i++) {
      await recorder.prepareToRecordAsync();
      recorder.record();
      await new Promise<void>((resolve) => {
        const t = setInterval(() => { if (stopFlag.current) { clearInterval(t); resolve(); } }, 500);
        setTimeout(() => { clearInterval(t); resolve(); }, AUDIO_CHUNK_MS);
      });
      await recorder.stop();
      if (recorder.uri) uploadEvidence(id, 'audio', recorder.uri).catch(() => {});
    }
    setRecording(false);
  }, [recorder, id]);

  useEffect(() => {
    if (!mine || !open || started.current) return;
    started.current = true;
    (async () => {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      setRecording(true);
      recordChunks().catch(() => setRecording(false));
    })();
    return () => { stopFlag.current = true; };
  }, [mine, open, recordChunks]);

  // ---------------------------------------------------------- photo / video
  const capture = async (kind: 'photo' | 'video') => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Camera blocked', 'Allow camera access in Settings to add evidence.');
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: kind === 'photo' ? ['images'] : ['videos'],
      quality: 0.6,
      videoMaxDuration: 30,
    });
    if (res.canceled || !res.assets[0]) return;
    setUploading(kind);
    try {
      await uploadEvidence(id, kind, res.assets[0].uri, res.assets[0].mimeType);
    } catch (e) {
      Alert.alert('Upload failed', errorMessage(e));
    } finally {
      setUploading(null);
    }
  };

  const setStatus = async (status: SosStatus) => {
    if (status === 'false_alarm' || status === 'resolved') stopFlag.current = true;
    const { error } = await supabase.rpc('update_sos_status', { p_alert: id, p_status: status });
    if (error) Alert.alert('Not updated', errorMessage(error));
  };

  const openEvidence = async (e: SosEvidence) => {
    const { data } = await supabase.storage.from(SOS_BUCKET).createSignedUrl(e.storage_path, 600);
    if (data?.signedUrl) Linking.openURL(data.signedUrl);
  };

  if (!alert) return <Screen><Body muted>Loading alert…</Body></Screen>;

  const tone = alert.status === 'active' ? 'red' : alert.status === 'acknowledged' ? 'amber' : 'green';
  const mapUrl = `https://maps.google.com/?q=${alert.lat},${alert.lng}`;

  return (
    <Screen>
      <View style={{ backgroundColor: open ? c.sos : c.primaryDeep, borderRadius: 26, padding: 22, marginBottom: 16 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', opacity: 0.9 }}>
          SOS · {fmtClock(alert.created_at)}
        </Text>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 6 }}>
          {mine
            ? open ? (alert.status === 'acknowledged' ? 'Help is responding' : 'Help is on the way') : 'Alert closed'
            : `${alert.resident?.full_name ?? 'Resident'}${alert.unit ? ` · Unit ${alert.unit.label}` : ''}`}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 8, fontSize: 15 }}>
          {mine
            ? 'Guards, your estate manager and the nearest police station have been alerted with your location.'
            : `${alert.estate?.name ?? ''}${alert.resident ? ` · ${formatUgPhone(alert.resident.phone)}` : ''}`}
        </Text>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label>Status</Label>
          <Badge label={alert.status.replace('_', ' ')} tone={tone} />
        </View>
        <Body muted style={{ marginTop: 6 }}>
          Location {alert.lat.toFixed(5)}, {alert.lng.toFixed(5)}
          {alert.accuracy_m ? ` (±${Math.round(alert.accuracy_m)}m)` : ' (approximate)'}
        </Body>
        <Button variant="secondary" title="Open in Maps" onPress={() => Linking.openURL(mapUrl)} style={{ marginTop: 12 }} />
      </Card>

      {mine && open ? (
        <Card>
          <Label>Evidence</Label>
          <Body muted style={{ marginBottom: 12 }}>
            {recording ? '● Recording audio quietly in the background.' : 'Audio recording is off.'} Add a photo or
            short video only if it's safe to.
          </Body>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" title="Photo" onPress={() => capture('photo')} loading={uploading === 'photo'} style={{ flex: 1 }} />
            <Button variant="secondary" title="Video" onPress={() => capture('video')} loading={uploading === 'video'} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      <Card tinted>
        <Label>Evidence received ({evidence.length})</Label>
        {evidence.length === 0 ? <Body muted>None yet.</Body> : null}
        {evidence.map((e) => (
          <Button key={e.id} variant="ghost" title={`${e.kind} · ${fmtClock(e.created_at)}`} onPress={() => openEvidence(e)} />
        ))}
      </Card>

      {mine && open ? (
        <>
          <Button variant="danger" title="Call 999" onPress={() => Linking.openURL('tel:999')} />
          <Button variant="ghost" title="I'm safe — cancel alert" onPress={() => setStatus('false_alarm')} style={{ marginTop: 8 }} />
        </>
      ) : null}

      {!mine && open ? (
        <>
          {alert.status === 'active' ? <Button title="I'm responding" onPress={() => setStatus('acknowledged')} /> : null}
          {alert.resident ? (
            <Button variant="secondary" title="Call resident" onPress={() => Linking.openURL(`tel:${alert.resident!.phone}`)} style={{ marginTop: 8 }} />
          ) : null}
          <Button variant="ghost" title="Mark resolved" onPress={() => setStatus('resolved')} style={{ marginTop: 8 }} />
        </>
      ) : null}

      <Button variant="ghost" title="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
