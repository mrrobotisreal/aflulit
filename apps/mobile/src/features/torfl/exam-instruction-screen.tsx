import { Ionicons } from '@expo/vector-icons';
import type { ExamSubtest } from '@sumrak/schema';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useAppTheme } from '@/theme/use-app-theme';

import { fmtMinutes, instructionCopy, type Lang } from './copy';
import { LangToggle } from './lang-toggle';
import type { TorflLevel } from './level-profile';
import { SUBTEST_LABELS } from './topics';

/**
 * The subtest instruction screen (T71, TORFL §8.2): the official RU
 * instruction (T77: RU ⇄ EN by the header toggle, pref `instructionLang`), the
 * time / items / dictionary facts, and «Начать субтест» — which starts the
 * clock (`BEGIN`). Nothing is timed until this button is pressed.
 */
export function ExamInstructionScreen({
  subtest,
  itemCount,
  lang,
  level = 'A1',
  durationOverrideSec,
  blocked,
  blockedAction,
  extraFacts,
  onBegin,
  onSkip,
  onQuit,
}: {
  subtest: ExamSubtest;
  itemCount: number;
  lang: Lang;
  level?: TorflLevel;
  /** DEV only: the `?devDurationSec=` override, shown so the tester knows. */
  durationOverrideSec?: number;
  /** A reason the subtest cannot start (listening audio not downloaded / no ASR model / mic denied). */
  blocked?: string | null;
  /** T73: an action under the blocked reason (Settings link). */
  blockedAction?: { label: string; onPress: () => void };
  /** T73: extra fact lines (the speaking tasks). */
  extraFacts?: string[];
  onBegin: () => void;
  onSkip: () => void;
  onQuit: () => void;
}) {
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const label = SUBTEST_LABELS[subtest.kind];
  const c = instructionCopy(lang);
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center justify-between px-4">
        <Pressable
          onPress={onQuit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={c.leave}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-2"
        >
          <Ionicons name="close" size={22} color={tokens.textMuted} />
        </Pressable>
        <LangToggle screen="instruction" level={level} />
      </View>
      <ScrollView contentContainerClassName="gap-5 px-5 pb-40 pt-4">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
          <Ionicons name={label.icon} size={26} color={tokens.accent} />
        </View>
        <View className="gap-1">
          <Text className="font-reading-bold text-3xl leading-10" testID="instruction-title">
            {subtest.title.ru}
          </Text>
          <Text variant="muted" className="font-reading-italic">
            {subtest.title.en}
          </Text>
        </View>
        <View className="gap-2 rounded-2xl border border-border bg-surface px-4 py-4">
          <Text className="font-reading text-lg leading-8" testID="instruction-text">
            {subtest.instructions[lang]}
          </Text>
        </View>
        <View className="gap-2.5 rounded-xl border border-border bg-surface px-4 py-3.5">
          <Fact
            icon="time-outline"
            text={
              durationOverrideSec !== undefined
                ? c.timeFactOverride(durationOverrideSec, fmtMinutes(lang, subtest.durationMin))
                : c.timeFact(fmtMinutes(lang, subtest.durationMin))
            }
          />
          <Fact icon="list-outline" text={c.itemsFact(itemCount)} />
          <Fact
            icon={subtest.dictionary ? 'book-outline' : 'close-circle-outline'}
            text={subtest.dictionary ? c.dictOn : c.dictOff}
          />
          {subtest.kind === 'listening' && (
            <Fact icon="headset-outline" text={c.listeningFact(subtest.audioPlays ?? 2)} />
          )}
          {subtest.kind === 'speaking' && (
            <>
              <Fact icon="mic-outline" text={c.speakingFact} />
              <Fact icon="hand-left-outline" text={c.micFact} />
            </>
          )}
          {(extraFacts ?? []).map((f) => (
            <Fact key={f} icon="chevron-forward-outline" text={f} />
          ))}
          <Fact icon="eye-off-outline" text={c.noCheckFact} />
        </View>
        {blocked ? (
          <View
            className="gap-2 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3"
            testID="instruction-blocked"
          >
            <View className="flex-row items-start gap-3">
              <Ionicons
                name={subtest.kind === 'speaking' ? 'mic-off-outline' : 'cloud-offline-outline'}
                size={20}
                color={tokens.danger}
              />
              <Text className="flex-1">{blocked}</Text>
            </View>
            {blockedAction ? (
              <Pressable
                onPress={blockedAction.onPress}
                accessibilityRole="button"
                testID="instruction-blocked-action"
                className="self-start rounded-full border border-border bg-surface px-4 py-1.5 active:bg-surface-2"
              >
                <Text className="font-ui-medium text-sm text-accent">{blockedAction.label}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <View
        className="absolute bottom-0 left-0 right-0 gap-2 border-t border-border bg-bg px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <Pressable
          onPress={onBegin}
          disabled={!!blocked}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!blocked }}
          testID="instruction-begin"
          className={`items-center rounded-full px-5 py-3.5 ${blocked ? 'bg-surface-2' : 'bg-accent active:opacity-80'}`}
        >
          <Text className={`font-ui-bold ${blocked ? 'text-text-muted' : 'text-bg'}`}>
            {c.beginSubtest}
          </Text>
        </Pressable>
        {blocked ? (
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            testID="instruction-skip"
            className="items-center py-2"
          >
            <Text className="font-ui-medium text-accent">{c.skipSubtest}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Fact({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  const { tokens } = useAppTheme();
  return (
    <View className="flex-row items-center gap-3">
      <Ionicons name={icon} size={16} color={tokens.textMuted} />
      <Text className="flex-1 text-sm leading-5">{text}</Text>
    </View>
  );
}
