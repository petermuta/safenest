import { darkColors, lightColors, type ThemeColors } from '@safenest/shared';
import { useColorScheme } from 'react-native';

export function useTheme(): { c: ThemeColors; dark: boolean } {
  const dark = useColorScheme() === 'dark';
  return { c: dark ? darkColors : lightColors, dark };
}

/** Soft, layered "3D" shadow for cards and buttons, tuned per platform. */
export const elevation = (color: string, level: 1 | 2 | 3 = 2) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: level * 4 },
  shadowOpacity: 1,
  shadowRadius: level * 8,
  elevation: level * 4,
});
