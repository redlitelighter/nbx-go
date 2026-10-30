/**
 * Trace — what GO is doing, as tasks with their steps (native take on
 * shadcn's Trace). A Task is one piece of work ("Price check"); each step
 * it takes ("Fetching SAUCE price") appears under it as it happens.
 * TraceCollapsible renders one task: open while running, folded to a
 * one-line summary once finished, tap to expand.
 */
import React, { useEffect, useState } from 'react';
import { LayoutAnimation, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Text } from './Text';
import { Tap } from './Tap';
import { Marker, type MarkerStatus } from './Marker';
import { useTheme } from '@/theme';

export interface TraceStep {
  id: string;
  label: string;
  status: MarkerStatus;
  detail?: string;
}

export interface TraceTask {
  title: string;
  status: MarkerStatus;
  steps: TraceStep[];
  startedAt: number;
  endedAt?: number;
}

export function Trace({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: 6 }}>{children}</View>;
}

const seconds = (t: TraceTask) => (((t.endedAt ?? Date.now()) - t.startedAt) / 1000).toFixed(1);

export function TraceCollapsible({ task }: { task: TraceTask }) {
  const theme = useTheme();
  const running = task.status === 'active';
  const [open, setOpen] = useState(running);

  // Fold away automatically when the task finishes.
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(running);
  }, [running]);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <View style={{ borderRadius: 14, backgroundColor: theme.colors.bgTertiary, overflow: 'hidden' }}>
      <Tap onPress={toggle} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
        <Marker status={task.status} />
        <Text variant="small" style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
          {task.title}
        </Text>
        {!running ? (
          <Text variant="small" color="textDisabled" style={{ fontVariant: ['tabular-nums'] }}>
            {task.steps.length} {task.steps.length === 1 ? 'step' : 'steps'} · {seconds(task)}s
          </Text>
        ) : null}
        <Chevron size={16} color={theme.colors.textSecondary} />
      </Tap>
      {open ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 8 }}>
          {task.steps.map((s, i) => (
            <View key={s.id} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ alignItems: 'center', width: 16 }}>
                <Marker status={s.status} size={14} />
                {i < task.steps.length - 1 ? (
                  <View style={{ width: 1.5, flex: 1, minHeight: 8, marginTop: 4, backgroundColor: theme.colors.borderStrong }} />
                ) : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 2 }}>
                <Text variant="small" color={s.status === 'pending' ? 'textDisabled' : 'textSecondary'}>
                  {s.label}
                </Text>
                {s.detail ? <Text variant="small" color="textDisabled">{s.detail}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
