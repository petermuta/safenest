// SafeNest design tokens — one source of truth for mobile and web.

export const palette = {
  deepEmerald: '#064E3B',
  emerald: '#10B981',
  freshGreen: '#34D399',
  mint: '#ECFDF5',
  offWhite: '#F8FAF9',
  charcoal: '#1F2937',
  sosRed: '#DC2626', // reserved for SOS only
  amber: '#F59E0B', // warnings
  white: '#FFFFFF',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryDeep: string;
  accent: string;
  tint: string;
  sos: string;
  warning: string;
  onPrimary: string;
  gradient: [string, string];
  shadow: string;
}

export const lightColors: ThemeColors = {
  background: palette.offWhite,
  surface: palette.white,
  surfaceRaised: palette.white,
  border: '#E3EEE8',
  text: palette.charcoal,
  textMuted: '#6B7280',
  primary: palette.emerald,
  primaryDeep: palette.deepEmerald,
  accent: palette.freshGreen,
  tint: palette.mint,
  sos: palette.sosRed,
  warning: palette.amber,
  onPrimary: palette.white,
  gradient: [palette.emerald, palette.deepEmerald],
  shadow: 'rgba(6, 78, 59, 0.18)',
};

export const darkColors: ThemeColors = {
  background: '#06140F',
  surface: '#0B2219',
  surfaceRaised: '#103024',
  border: '#1A3D30',
  text: '#E8F5EE',
  textMuted: '#9CB8AB',
  primary: palette.freshGreen,
  primaryDeep: palette.emerald,
  accent: palette.freshGreen,
  tint: '#0F2A20',
  sos: palette.sosRed,
  warning: palette.amber,
  onPrimary: '#03130D',
  gradient: [palette.emerald, palette.deepEmerald],
  shadow: 'rgba(0, 0, 0, 0.55)',
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Format an amount in Uganda shillings, e.g. 150000 -> "UGX 150,000". */
export const formatUGX = (amount: number) =>
  `UGX ${Math.round(amount).toLocaleString('en-US')}`;
