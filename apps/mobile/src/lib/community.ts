export const CATEGORIES: { key: string; label: string; emoji: string }[] = [
  { key: 'suspicious_person', label: 'Suspicious person', emoji: '🕵️' },
  { key: 'suspicious_vehicle', label: 'Suspicious vehicle', emoji: '🚗' },
  { key: 'break_in', label: 'Break-in', emoji: '🚪' },
  { key: 'fire', label: 'Fire', emoji: '🔥' },
  { key: 'accident', label: 'Accident', emoji: '🚑' },
  { key: 'noise', label: 'Disturbance', emoji: '📢' },
  { key: 'other', label: 'Other', emoji: '⚠️' },
];
export const categoryOf = (key: string) => CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];

export interface CommunityAlert {
  id: string;
  category: string;
  message: string;
  lat: number;
  lng: number;
  status: 'open' | 'resolved' | 'removed';
  created_at: string;
  has_photo: boolean;
  sent_to_police: boolean;
  mine: boolean;
  author: string;
  estate_name: string | null;
  distance_km: number;
  see_it_too: number;
  all_clear: number;
  my_reaction: 'see_it_too' | 'all_clear' | null;
  i_reported: boolean;
  can_moderate: boolean;
}

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
