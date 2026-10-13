import { Redirect } from 'expo-router';
import * as React from 'react';
import { ScrollView, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * T01 glyph check (UI_DESIGN §2/§3, ADR-0005 §8): one sample line per Hebrew
 * face and size so niqqud stacking, dagesh, geresh/gershayim, maqaf and
 * mixed digits can be eyeballed on the S25 and screenshotted into
 * docs-aflulit/evidence/T01/. `__DEV__` only — the dev-client build drops it.
 *
 * Hebrew literals live here deliberately: this screen IS the test surface
 * for the fonts. ADR-0005's "no raw Hebrew outside <HebrewText>" lint (T05)
 * allow-lists this file.
 */

const SAMPLES: readonly { label: string; text: string }[] = [
  { label: 'wordmark', text: 'אַפְלוּלִית' },
  { label: 'shva + qamats + patah', text: 'בְּרֵאשִׁית בָּרָא' },
  { label: 'qubuts + shin dot + dagesh', text: 'שֻׁלְחָן' },
  { label: 'holam + segol + hiriq', text: 'קוֹרְאִים לִי בֶּן' },
  { label: 'qamats + holam + final kaf', text: 'מְצָאתִי אוֹתְךָ' },
  { label: 'geresh + gershayim', text: 'צ׳יפס · ד״ר' },
  { label: 'maqaf', text: 'בֵּית־סֵפֶר' },
  { label: 'digits inside Hebrew', text: '3 שְׁקָלִים' },
];

interface Face {
  name: string;
  fontFamily: string;
  sizes: readonly number[];
  /** Line-height ratio — pointed text needs ≥ 1.55 (UI_DESIGN §3). */
  ratio: number;
}

const FACES: readonly Face[] = [
  {
    name: 'Frank Ruhl Libre 400',
    fontFamily: 'FrankRuhlLibre_400Regular',
    sizes: [16, 19, 23.5],
    ratio: 1.65,
  },
  {
    name: 'Frank Ruhl Libre 700',
    fontFamily: 'FrankRuhlLibre_700Bold',
    sizes: [16, 19, 23.5],
    ratio: 1.65,
  },
  {
    name: 'Noto Sans Hebrew 400',
    fontFamily: 'NotoSansHebrew_400Regular',
    sizes: [16, 19, 23.5],
    ratio: 1.6,
  },
  {
    name: 'Noto Sans Hebrew 500',
    fontFamily: 'NotoSansHebrew_500Medium',
    sizes: [14, 16],
    ratio: 1.6,
  },
  {
    name: 'Rubik Wet Paint (splash size)',
    fontFamily: 'RubikWetPaint_400Regular',
    sizes: [64],
    ratio: 1.35,
  },
];

export default function DevGlyphsScreen() {
  const { tokens } = useAppTheme();
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-5 pb-16 pt-4 gap-6"
      testID="dev-glyphs"
    >
      <Text variant="caption">
        Check: marks sit under/over their letter, dagesh centred, shin dot top-right, no clipped
        descenders at the largest size. Never letter-space Hebrew.
      </Text>
      {FACES.map((face) => (
        <View
          key={face.fontFamily}
          className="gap-3 rounded-xl border border-border bg-surface p-4"
        >
          <Text className="font-ui-medium">{face.name}</Text>
          {face.sizes.map((size) => (
            <View key={size} className="gap-1">
              <Text variant="caption">{size} px</Text>
              {SAMPLES.map((s) => (
                <RNText
                  key={s.label}
                  accessibilityLanguage="he"
                  style={{
                    fontFamily: face.fontFamily,
                    fontSize: size,
                    lineHeight: Math.round(size * face.ratio),
                    color: face.fontFamily.startsWith('Rubik') ? tokens.glow : tokens.text,
                    writingDirection: 'rtl',
                    textAlign: 'right',
                    letterSpacing: 0,
                  }}
                >
                  {s.text}
                </RNText>
              ))}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
