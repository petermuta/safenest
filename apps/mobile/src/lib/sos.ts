import { SOS_BUCKET, type EvidenceKind } from '@safenest/shared';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import type { MembershipWithEstate } from './auth';
import { supabase } from './supabase';

interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
  approximate: boolean;
}

/** Best location we can get within ~8s; falls back to last known, then the estate's pin. */
export async function getFix(m: MembershipWithEstate): Promise<Fix> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.granted) {
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]);
      const p = pos ?? (await Location.getLastKnownPositionAsync());
      if (p) return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null, approximate: !pos };
    }
  } catch {
    // fall through to the estate location
  }
  if (m.estate.lat != null && m.estate.lng != null) {
    return { lat: m.estate.lat, lng: m.estate.lng, accuracy: null, approximate: true };
  }
  throw new Error('Could not get your location. Turn on location services and try again.');
}

export interface RaisedSos {
  alertId: string;
  approximate: boolean;
}

/**
 * 1. Create the alert (database picks the nearest police station)
 * 2. Ask the edge function to push + SMS guards, manager and police
 */
export async function raiseSos(m: MembershipWithEstate): Promise<RaisedSos> {
  const fix = await getFix(m);
  const { data: alertId, error } = await supabase.rpc('trigger_sos', {
    p_lat: fix.lat,
    p_lng: fix.lng,
    p_accuracy: fix.accuracy,
    p_estate: m.estate.id,
  });
  if (error || !alertId) throw error ?? new Error('Could not create the alert');

  // Don't await failures here: the alert row already exists and staff see it live.
  supabase.functions.invoke('sos-dispatch', { body: { alert_id: alertId } }).catch(() => {});
  return { alertId: alertId as string, approximate: fix.approximate };
}

/** No data connection: open the SMS composer to the gate with the location filled in. */
export async function smsFallback(m: MembershipWithEstate) {
  if (!m.estate.gate_phone || !(await SMS.isAvailableAsync())) return false;
  let where = '';
  try {
    const p = await Location.getLastKnownPositionAsync();
    if (p) where = ` Location: https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`;
  } catch {}
  const unit = m.unit ? `Unit ${m.unit.label}` : '';
  await SMS.sendSMSAsync([m.estate.gate_phone], `SOS from SafeNest: I need help now. ${m.estate.name} ${unit}.${where}`);
  return true;
}

const EXT: Record<EvidenceKind, { ext: string; type: string }> = {
  photo: { ext: 'jpg', type: 'image/jpeg' },
  video: { ext: 'mp4', type: 'video/mp4' },
  audio: { ext: 'm4a', type: 'audio/m4a' },
};

export async function uploadEvidence(alertId: string, kind: EvidenceKind, uri: string, mime?: string) {
  const { ext, type } = EXT[kind];
  const isMov = kind === 'video' && uri.toLowerCase().endsWith('.mov');
  const path = `${alertId}/${kind}-${Date.now()}.${isMov ? 'mov' : ext}`;
  const body = await (await fetch(uri)).arrayBuffer();

  const { error } = await supabase.storage
    .from(SOS_BUCKET)
    .upload(path, body, { contentType: mime ?? (isMov ? 'video/quicktime' : type), upsert: false });
  if (error) throw error;

  const { error: rowErr } = await supabase.from('sos_evidence').insert({ alert_id: alertId, kind, storage_path: path });
  if (rowErr) throw rowErr;
}
