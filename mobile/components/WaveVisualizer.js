import React, { useRef, useEffect } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_COUNT = 38;
const MAX_HEIGHT = 58;

const BAR_COLORS = [
  'rgba(124,92,252,0.55)',
  'rgba(180,140,255,0.35)',
  'rgba(90,55,200,0.28)',
];

export default function WaveVisualizer({ visible, intensity = 0.5 }) {
  const containerOpacity = useRef(new Animated.Value(0)).current;
  const barAnims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.05))
  ).current;
  const loopsRef = useRef([]);

  useEffect(() => {
    Animated.timing(containerOpacity, {
      toValue: visible ? 1 : 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  useEffect(() => {
    loopsRef.current.forEach(l => l.stop());
    loopsRef.current = [];

    if (!visible) return;

    loopsRef.current = barAnims.map((anim, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.12 + Math.random() * 0.88 * intensity,
            duration: 300 + Math.random() * 400,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0.04 + Math.random() * 0.2 * intensity,
            duration: 300 + Math.random() * 400,
            useNativeDriver: false,
          }),
        ])
      );
      setTimeout(() => loop.start(), (i / BAR_COUNT) * 600);
      return loop;
    });

    return () => loopsRef.current.forEach(l => l.stop());
  }, [visible, intensity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { opacity: containerOpacity }]}
    >
      <View style={styles.bars}>
        {barAnims.map((anim, i) => {
          const height = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [2, MAX_HEIGHT],
          });
          return (
            <View key={i} style={styles.barWrapper}>
              <Animated.View
                style={[
                  styles.bar,
                  { height, backgroundColor: BAR_COLORS[i % 3] },
                ]}
              />
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    justifyContent: 'flex-end',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: MAX_HEIGHT,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 0.5,
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
});
