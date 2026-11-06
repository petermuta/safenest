// Domain types shared by the mobile app, web dashboard and edge functions.
// They mirror the tables in supabase/migrations/0001_schema.sql.

export type AppRole = 'super_admin' | 'estate_manager' | 'guard' | 'resident';
export type MemberRole = 'manager' | 'guard' | 'resident';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended';
export type PassStatus = 'active' | 'used' | 'expired' | 'revoked';
export type EntryMethod = 'pass_qr' | 'pass_code' | 'walk_in';
export type SosStatus = 'active' | 'acknowledged' | 'resolved' | 'false_alarm';
export type EvidenceKind = 'photo' | 'video' | 'audio';

export interface Profile {
  id: string;
  phone: string; // E.164, e.g. +256712345678
  full_name: string | null;
  role: AppRole;
  expo_push_token: string | null;
  created_at: string;
}

export interface Estate {
  id: string;
  name: string;
  district: string | null;
  address: string | null;
  gate_phone: string | null;
  lat: number | null;
  lng: number | null;
  manager_id: string;
  subscription_status: SubscriptionStatus;
  created_at: string;
}

export interface Unit {
  id: string;
  estate_id: string;
  label: string; // e.g. "A4" or "House 12"
  block: string | null;
  created_at: string;
}

export interface Membership {
  id: string;
  estate_id: string;
  user_id: string;
  unit_id: string | null;
  role: MemberRole;
  active: boolean;
  created_at: string;
}

export interface Invitation {
  id: string;
  estate_id: string;
  unit_id: string | null;
  phone: string;
  full_name: string | null;
  role: MemberRole;
  invited_by: string;
  accepted_at: string | null;
  created_at: string;
}

export interface GuestPass {
  id: string;
  estate_id: string;
  unit_id: string;
  created_by: string;
  guest_name: string;
  guest_phone: string | null;
  vehicle_plate: string | null;
  code: string; // 6 digits, unique among active passes in the estate
  qr_token: string; // unguessable UUID encoded in the QR
  valid_from: string;
  valid_until: string;
  status: PassStatus;
  used_at: string | null;
  verified_by: string | null;
  created_at: string;
}

export interface VisitorLog {
  id: string;
  estate_id: string;
  unit_id: string | null;
  pass_id: string | null;
  guest_name: string;
  guest_phone: string | null;
  vehicle_plate: string | null;
  guard_id: string;
  method: EntryMethod;
  notes: string | null;
  entry_at: string;
  exit_at: string | null;
}

export interface PoliceStation {
  id: string;
  name: string;
  district: string | null;
  phone: string;
  lat: number;
  lng: number;
  active: boolean;
}

export interface SosAlert {
  id: string;
  estate_id: string;
  unit_id: string | null;
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  status: SosStatus;
  police_station_id: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface SosEvidence {
  id: string;
  alert_id: string;
  kind: EvidenceKind;
  storage_path: string;
  created_at: string;
}

/** Result of the verify_guest_pass RPC that guards call at the gate. */
export interface PassVerification {
  ok: boolean;
  reason: 'valid' | 'not_found' | 'already_used' | 'expired' | 'not_yet_valid' | 'revoked';
  guest_name: string | null;
  unit_label: string | null;
  vehicle_plate: string | null;
  valid_until: string | null;
  log_id: string | null;
}

/** QR payload prefix so guards can't accidentally scan unrelated codes. */
export const QR_PREFIX = 'SAFENEST:';
export const qrPayload = (token: string) => `${QR_PREFIX}${token}`;
export const parseQrPayload = (raw: string): string | null =>
  raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length).trim() : null;

export const SOS_BUCKET = 'sos-evidence';
