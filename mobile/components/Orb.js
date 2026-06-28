import React, { useRef, useEffect } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const ORB_SIZE = 130;
const RINGS = [
  { size: 220, delay: 0 },
  { size: 270, delay: 700 },
  { size: 330, delay: 1400 },
];

function OrbRing({ size, delay }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let timeout;
    const start = () => {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 3000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) start();
      });
    };
    timeout = setTimeout(start, delay);
    return () => {
      clearTimeout(timeout);
      progress.stopAnimation();
    };
  }, []);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: 'rgba(124,92,252,0.2)',
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

export default function Orb({ state }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    scaleAnim.stopAnimation();

    let loop;
    if (state === 'idle' || state === 'processing') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.05, duration: 2000, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1.0, duration: 2000, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
        ])
      );
    } else if (state === 'listening') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.12, duration: 800, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1.0, duration: 800, useNativeDriver: true }),
        ])
      );
    } else if (state === 'speaking') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.08, duration: 500, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }),
        ])
      );
    }

    loop?.start();
    return () => loop?.stop();
  }, [state]);

  const isSpeaking = state === 'speaking';
  const orbColors = isSpeaking
    ? ['#ffffff', '#c4aaff', '#9b7eff', '#6040e0', '#2a1880']
    : ['#e0d0ff', '#9b7eff', '#6040e0', '#2a1880', '#110a40'];

  return (
    <View style={styles.container}>
      {RINGS.map((r, i) => (
        <OrbRing key={i} size={r.size} delay={r.delay} />
      ))}
      <View style={[styles.glowLayer, isSpeaking && styles.glowBright]} />
      <Animated.View style={[styles.orb, { transform: [{ scale: scaleAnim }] }]}>
        <LinearGradient
          colors={orbColors}
          start={{ x: 0.22, y: 0.1 }}
          end={{ x: 0.85, y: 0.92 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
    width: 155,
    height: 155,
    borderRadius: 77,
    backgroundColor: 'rgba(100,60,220,0.2)',
  },
  glowBright: {
    backgroundColor: 'rgba(180,140,255,0.28)',
  },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    overflow: 'hidden',
    shadowColor: '#7c5cfc',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 28,
    elevation: 20,
    zIndex: 2,
  },
});
