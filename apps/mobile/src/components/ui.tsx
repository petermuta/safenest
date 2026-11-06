import { radius, spacing } from '@safenest/shared';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { elevation, useTheme } from '../lib/theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { c } = useTheme();
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.screenPad} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenPad, { flex: 1 }]}>{children}</View>
  );
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>{body}</SafeAreaView>;
}

export function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: c.text, letterSpacing: -0.5 }}>{children}</Text>
      {sub ? <Text style={{ fontSize: 15, color: c.textMuted, marginTop: 4 }}>{sub}</Text> : null}
    </View>
  );
}

/** Layered card: soft drop shadow plus a subtle inner top highlight. */
export function Card({ children, style, tinted }: { children: ReactNode; style?: ViewStyle; tinted?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: tinted ? c.tint : c.surfaceRaised,
          borderRadius: radius.lg,
          padding: spacing.lg,
          marginBottom: spacing.md,
          borderWidth: 1,
          borderColor: c.border,
          borderTopColor: tinted ? c.border : 'rgba(255,255,255,0.6)',
        },
        elevation(c.shadow, 1),
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 6 }}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const { c } = useTheme();
  return <Text style={[{ fontSize: 15, color: muted ? c.textMuted : c.text, lineHeight: 21 }, style]}>{children}</Text>;
}

export function Input(props: TextInputProps & { label?: string }) {
  const { c } = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        placeholderTextColor={c.textMuted}
        {...rest}
        style={[
          {
            backgroundColor: c.surface,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: 14,
            fontSize: 17,
            color: c.text,
          },
          style,
        ]}
      />
    </View>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title, onPress, loading, disabled, variant = 'primary', style,
}: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: Variant; style?: ViewStyle;
}) {
  const { c } = useTheme();
  const off = disabled || loading;
  const textColor = variant === 'primary' || variant === 'danger' ? '#fff' : c.primaryDeep;
  const inner = loading ? <ActivityIndicator color={textColor} /> : (
    <Text style={{ color: textColor, fontSize: 16, fontWeight: '700' }}>{title}</Text>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        { borderRadius: radius.md, opacity: off ? 0.55 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === 'primary' || variant === 'danger' ? elevation(variant === 'danger' ? 'rgba(220,38,38,0.35)' : c.shadow, 2) : null,
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={c.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
          {inner}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.btn,
            variant === 'danger' && { backgroundColor: c.sos },
            variant === 'secondary' && { backgroundColor: c.tint, borderWidth: 1, borderColor: c.border },
          ]}
        >
          {inner}
        </View>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, marginRight: 8, marginBottom: 8,
        backgroundColor: selected ? c.primary : c.surface, borderWidth: 1, borderColor: selected ? c.primary : c.border,
      }}
    >
      <Text style={{ color: selected ? c.onPrimary : c.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'green' }: { label: string; tone?: 'green' | 'amber' | 'red' | 'grey' }) {
  const { c } = useTheme();
  const map = {
    green: [c.tint, c.primaryDeep], amber: ['rgba(245,158,11,0.15)', '#B45309'],
    red: ['rgba(220,38,38,0.12)', c.sos], grey: [c.surface, c.textMuted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <Card tinted>
      <Body muted>{text}</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  screenPad: { padding: spacing.xl, paddingBottom: 120 },
  btn: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
});
