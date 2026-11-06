import { palette } from '@safenest/shared';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

const HOLD_MS = 1500;
const SIZE = 210;

/**
 * Raised, glowing SOS button. Hold for 1.5s to trigger — a single accidental tap
 * in a pocket won't fire it. A ring fills while holding; haptics tick at start and fire.
 */
export function SOSButton({ onTrigger, busy }: { onTrigger: () => void; busy?: boolean }) {
  const glow = useRef(new Animated.Value(0)).current;
  const hold = useRef(new Animated.Value(0)).current;
  const holdAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const start = () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    holdAnim.current = Animated.timing(hold, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true });
    holdAnim.current.start(({ finished }) => {
      if (finished) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        hold.setValue(0);
        onTrigger();
      }
    });
  };

  const cancel = () => {
    holdAnim.current?.stop();
    Animated.timing(hold, { toValue: 0, duration: 180, useNativeDriver: true }).start();
  };

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.08] });
  const fillScale = hold.interpolate({ inputRange: [0, 1], outputRange: [0.0, 1] });

  return (
    <View style={styles.wrap} accessible accessibilityRole="button" accessibilityLabel="SOS. Press and hold to send an emergency alert.">
      <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
      <Animated.View style={[styles.glow, styles.glowInner]} />
      <Pressable onPressIn={start} onPressOut={cancel} disabled={busy}>
        <View style={styles.base}>
          <LinearGradient colors={['#F87171', palette.sosRed, '#991B1B']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.face}>
            <Animated.View style={[styles.fill, { transform: [{ scale: fillScale }] }]} />
            <View style={styles.highlight} />
            <Text style={styles.label}>{busy ? 'SENDING' : 'SOS'}</Text>
            <Text style={styles.hint}>{busy ? 'Alerting help…' : 'Press & hold'}</Text>
          </LinearGradient>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', height: SIZE + 90, marginVertical: 8 },
  glow: { position: 'absolute', width: SIZE + 70, height: SIZE + 70, borderRadius: 999, backgroundColor: palette.sosRed },
  glowInner: { width: SIZE + 26, height: SIZE + 26, opacity: 0.18 },
  base: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: '#7F1D1D', paddingBottom: 8,
    shadowColor: palette.sosRed, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.55, shadowRadius: 24, elevation: 18,
  },
  face: { flex: 1, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fill: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  highlight: {
    position: 'absolute', top: 14, width: SIZE * 0.62, height: SIZE * 0.28, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  label: { color: '#fff', fontSize: 52, fontWeight: '900', letterSpacing: 4 },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600', marginTop: 2 },
});
