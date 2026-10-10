import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useDueBreakdown } from '@/db/hooks';
import { DEFAULT_W } from '@/features/review/fsrs-settings';
import { track } from '@/services/analytics';
import { useFsrsPrefs } from '@/store/fsrs-prefs';
import { useQueuePrefs } from '@/store/queue-prefs';
import { useAppTheme } from '@/theme/use-app-theme';

import { backlogLine, type DuePlan, type DueSource } from './due-core';
import { formatRetentionPercent } from './scheduling-core';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const STATE_LABEL: [keyof DuePlan['byState'], string][] = [
  ['new', 'Новые'],
  ['learning', 'Учатся'],
  ['review', 'Повторение'],
  ['relearning', 'Заново'],
];
const DIRECTION_LABEL: Record<string, string> = {
  'ru-en': 'RU → EN',
  'en-ru': 'EN → RU',
  listening: 'Аудирование',
  production: 'Произношение',
};
const SOURCE_LABEL: Record<DueSource, string> = {
  reader: 'Читалка',
  topic: 'Тема целиком',
  scenario: 'Сценарий',
  journal: 'Дневник',
  manual: 'Вручную',
  unknown: 'Неизвестно',
};
const OVERDUE_LABEL: [keyof DuePlan['overdue'], string][] = [
  ['today', 'сегодня'],
  ['d1to2', '1–2 дня'],
  ['d3to7', '3–7 дней'],
  ['d8to30', '8–30 дней'],
  ['d31plus', '31+ дней'],
];

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="text-sm text-text">{label}</Text>
      <Text className="text-sm text-text-muted" style={{ fontFamily: MONO }}>
        {value}
      </Text>
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-4">
      <Text variant="caption" className="mb-1 uppercase tracking-wider">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** «Почему столько?» — permanent readout of what the Today number is made of (T82). */
export function DueBreakdownSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const q = useDueBreakdown();
  const retention = useFsrsPrefs((s) => s.desiredRetention);
  const params = useFsrsPrefs((s) => s.params);
  const newPerDay = useQueuePrefs((s) => s.prefs.newPerDay);
  const bury = useQueuePrefs((s) => s.prefs.buryRelated);
  const plan = q.data;

  const tracked = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      tracked.current = false;
      return;
    }
    if (plan && !tracked.current) {
      tracked.current = true;
      track('due_breakdown_viewed', {
        reviewDue: plan.reviewDue,
        newToday: plan.newToday,
        newBacklog: plan.newBacklog,
      });
    }
  }, [open, plan]);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-scrim/50" onPress={onClose} accessibilityLabel="Close" />
      <View
        className="rounded-t-2xl border-t border-border bg-surface px-5 pt-4"
        style={{ paddingBottom: insets.bottom + 24, maxHeight: '85%' }}
      >
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="font-ui-medium text-lg">Почему столько?</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={tokens.textMuted} />
          </Pressable>
        </View>
        {plan ? (
          <ScrollView>
            <Text variant="caption">
              Сегодня: {plan.reviewDue} повторений + {plan.newToday} новых ({plan.newTodayWords}{' '}
              слов из {newPerDay} в день). Новые слова не накапливаются в счётчике — лишнее ждёт в
              очереди.
            </Text>
            <Block title="Сегодня">
              <Row label="К повторению" value={plan.reviewDue} />
              <Row label="Новые сегодня" value={plan.newToday} />
              <Row
                label="Бюджет новых слов осталось"
                value={`${plan.newBudgetLeft} / ${newPerDay}`}
              />
              <Row label="Учатся / заново (внутри повторений)" value={plan.learning} />
              <Row label="В очереди (не в счёте)" value={backlogLine(plan.newBacklog) ?? '0'} />
              <Row label="Прятать родственные карточки" value={bury ? 'да' : 'нет'} />
            </Block>
            <Block title="По состоянию">
              {STATE_LABEL.map(([k, label]) => (
                <Row key={k} label={label} value={plan.byState[k]} />
              ))}
            </Block>
            <Block title="По направлению">
              {Object.entries(plan.byDirection).map(([d, n]) => (
                <Row key={d} label={DIRECTION_LABEL[d] ?? d} value={n} />
              ))}
            </Block>
            <Block title="По источнику слова">
              {(Object.keys(SOURCE_LABEL) as DueSource[])
                .filter((s) => plan.bySource[s] > 0)
                .map((s) => (
                  <Row key={s} label={SOURCE_LABEL[s]} value={plan.bySource[s]} />
                ))}
            </Block>
            <Block title="Просрочено (повторения)">
              {OVERDUE_LABEL.map(([k, label]) => (
                <Row key={k} label={label} value={plan.overdue[k]} />
              ))}
            </Block>
            <Block title="Планировщик">
              <Row label="Желаемое удержание" value={formatRetentionPercent(retention)} />
              <Row
                label="Веса"
                value={params ? `оптимизированы ${params.fittedAt.slice(0, 10)}` : 'по умолчанию'}
              />
              <Text variant="caption" className="mt-1" style={{ fontFamily: MONO }}>
                w[0..3] ={' '}
                {(params?.w ?? DEFAULT_W)
                  .slice(0, 4)
                  .map((x) => x.toFixed(2))
                  .join(' ')}
              </Text>
            </Block>
          </ScrollView>
        ) : (
          <Text variant="muted" className="mt-3">
            …
          </Text>
        )}
      </View>
    </Modal>
  );
}
