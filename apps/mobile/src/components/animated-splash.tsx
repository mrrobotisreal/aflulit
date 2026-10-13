import { Image } from 'expo-image';
import * as React from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';

import { track } from '@/services/analytics';

import { SPLASH_TITLE } from './splash-title';

// Fixed palette on purpose (not theme tokens): the intro must look identical in
// both themes and blend seamlessly with the native splash background declared
// in app.json (#0A0A17) and the blue crescent glow baked into the artwork
// (UI_DESIGN §2).
const BG = '#0A0A17';
const TITLE_BLUE = '#7CC4FF';
const GLOW_BLUE = '#4D6BFF';

/**
 * In-app splash intro shown once per launch, immediately after the native
 * splash hides: the full crescent-moon artwork near full-width with the app
 * title «אַפְלוּלִית» in RubikWetPaint below it, then the whole overlay fades
 * into the app.
 */
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const [overlayOpacity] = React.useState(() => new Animated.Value(1));
  const [titleOpacity] = React.useState(() => new Animated.Value(0));
  const [titleShift] = React.useState(() => new Animated.Value(14));

  const doneRef = React.useRef(onDone);
  React.useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  React.useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(titleShift, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
      Animated.delay(1100),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        track('splash_intro_completed');
      }
      doneRef.current();
    });
  }, [overlayOpacity, titleOpacity, titleShift]);

  const artSize = Math.min(width * 0.92, height * 0.6);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.overlay, { opacity: overlayOpacity }]}
    >
      <Image
        source={require('../../assets/images/icon.png')}
        // The artwork's own rounded corners sit at ~22% of its edge length
        style={{ width: artSize, height: artSize, borderRadius: artSize * 0.22 }}
        contentFit="cover"
      />
      <Animated.Text
        accessibilityLanguage="he"
        style={[
          styles.title,
          { fontSize: Math.min(64, width * 0.17) },
          { opacity: titleOpacity, transform: [{ translateY: titleShift }] },
        ]}
      >
        {SPLASH_TITLE}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
    gap: 28,
  },
  title: {
    fontFamily: 'RubikWetPaint_400Regular',
    color: TITLE_BLUE,
    // Hebrew is never letter-spaced — it breaks niqqud attachment (ADR-0005).
    letterSpacing: 0,
    writingDirection: 'rtl',
    textShadowColor: GLOW_BLUE,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
});
