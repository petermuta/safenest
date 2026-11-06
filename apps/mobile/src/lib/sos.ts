import type { EvidenceKind } from '@safenest/shared';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import type { MembershipWithEstate } from './auth';
import { api } from './api';

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

/** Sends the alert: the server saves it, picks the nearest police station and notifies everyone. */
export async function raiseSos(m: MembershipWithEstate): Promise<RaisedSos> {
  const fix = await getFix(m);
  // The server saves the alert, then pushes/SMSes guards, manager and police.
  const { alert_id } = await api<{ alert_id: string }>('/api/sos', {
    body: { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, estate_id: m.estate.id },
  });
  return { alertId: alert_id, approximate: fix.approximate };
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

const MIME: Record<EvidenceKind, { ext: string; type: string }> = {
  photo: { ext: 'jpg', type: 'image/jpeg' },
  video: { ext: 'mp4', type: 'video/mp4' },
  audio: { ext: 'm4a', type: 'audio/m4a' },
};

/** Uploads one evidence file (photo, short video or audio clip) to the alert. Max ~5.5 MB. */
export async function uploadEvidence(alertId: string, kind: EvidenceKind, uri: string, mime?: string) {
  const isMov = kind === 'video' && uri.toLowerCase().endsWith('.mov');
  const type = mime ?? (isMov ? 'video/quicktime' : MIME[kind].type);
  const form = new FormData();
  form.append('kind', kind);
  // React Native's FormData accepts a { uri, name, type } file reference.
  form.append('file', { uri, name: `${kind}.${isMov ? 'mov' : MIME[kind].ext}`, type } as unknown as Blob);
  await api(`/api/sos/${alertId}/evidence`, { form });
}
