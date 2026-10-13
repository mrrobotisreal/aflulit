import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

import { instructionCopy } from './copy';
import {
  toggleInstructionLang,
  useInstructionLang,
  type InstructionScreen,
} from './instruction-lang';
import type { TorflLevel } from './level-profile';

/**
 * The «RU | EN» header toggle (T77): one tap flips every INSTRUCTION string on
 * the screen (never the examiner / topic / passage content). Persisted.
 */
export function LangToggle({
  screen,
  level = 'A1',
}: {
  screen: InstructionScreen;
  level?: TorflLevel;
}) {
  const lang = useInstructionLang();
  return (
    <Pressable
      onPress={() => toggleInstructionLang(screen, level)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={instructionCopy(lang).toggleA11y}
      accessibilityValue={{ text: lang === 'ru' ? 'Русский' : 'English' }}
      testID="lang-toggle"
      className="flex-row overflow-hidden rounded-full border border-border bg-surface"
    >
      {(['ru', 'en'] as const).map((l) => (
        <View key={l} className={cn('px-2.5 py-1', lang === l && 'bg-accent')}>
          <Text className={cn('font-ui-bold text-xs', lang === l ? 'text-bg' : 'text-text-muted')}>
            {l.toUpperCase()}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}
