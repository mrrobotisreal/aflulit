import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import type { ColorTokens } from '@/theme/colors';
import { useAppTheme } from '@/theme/use-app-theme';

import type { FlameTier } from './goal-rings';

/**
 * T84: the streak flame that grades the day (Today card; the widget draws the
 * same tiers natively in GoalRing.kt): unlit outline → pale yellow → bright
 * yellow → bright orange → bright orange-red with a soft yellow halo.
 */
export function flameColor(tier: FlameTier, tokens: ColorTokens): string {
  switch (tier) {
    case 'none':
      return tokens.textMuted;
    case 'started':
      return tokens.flamePale;
    case 'one':
      return tokens.flameYellow;
    case 'two':
      return tokens.flameOrange;
    case 'all':
      return tokens.flameRed;
  }
}

export function StreakFlame({ tier, size }: { tier: FlameTier; size: number }) {
  const { tokens } = useAppTheme();
  const color = flameColor(tier, tokens);
  const glow = size * 2.2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {tier === 'all' && (
        <Svg
          width={glow}
          height={glow}
          style={{ position: 'absolute', left: (size - glow) / 2, top: (size - glow) / 2 }}
          pointerEvents="none"
        >
          <Defs>
            <RadialGradient id="flame-glow" cx="50%" cy="55%" rx="50%" ry="50%">
              {/* Mitch 2026-10-13: a YELLOW halo, clear behind the flame, so the
                  orange-red flame stands out instead of reading as a sphere. */}
              <Stop offset="0" stopColor={tokens.flameYellow} stopOpacity={0} />
              <Stop offset="0.28" stopColor={tokens.flameYellow} stopOpacity={0.12} />
              <Stop offset="0.5" stopColor={tokens.flameYellow} stopOpacity={0.45} />
              <Stop offset="1" stopColor={tokens.flameYellow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={glow / 2} cy={glow / 2} r={glow / 2} fill="url(#flame-glow)" />
        </Svg>
      )}
      <Ionicons
        name={tier === 'none' ? 'flame-outline' : 'flame'}
        size={size}
        color={color}
        accessibilityLabel={`Flame: ${tier}`}
      />
    </View>
  );
}
