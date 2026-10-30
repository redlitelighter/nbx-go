/**
 * Dropdown — a select menu (native take on shadcn's DropdownMenu): a
 * trigger showing the current option, opening an anchored list with icons,
 * a right-hand detail and a check on the active item. Closes on pick or on
 * a tap outside.
 */
import React, { useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { Text } from './Text';
import { Tap } from './Tap';
import { useTheme } from '@/theme';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: ImageSourcePropType;
  /** Right-aligned detail, e.g. a price. */
  detail?: string;
  detailColor?: 'success' | 'error' | 'textSecondary';
}

export function Dropdown({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Small caption above the menu. */
  label?: string;
}) {
  const theme = useTheme();
  const { height: screenH } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 16, y: 120, w: 260 });
  const current = options.find((o) => o.value === value) ?? options[0];

  const show = () => {
    trigger.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y: y + h + 6, w: Math.max(w, 260) });
      setOpen(true);
    });
  };

  return (
    <>
      <Pressable
        ref={trigger}
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Select'}: ${current?.label}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          alignSelf: 'flex-start',
          paddingLeft: 6,
          paddingRight: 12,
          height: 40,
          borderRadius: 20,
          backgroundColor: theme.colors.bgSecondary,
        }}
      >
        {current?.icon ? <Image source={current.icon} style={{ width: 28, height: 28, borderRadius: 14 }} /> : null}
        <Text variant="body" style={{ fontWeight: '600' }}>{current?.label}</Text>
        <ChevronDown size={16} color={theme.colors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View
            style={{
              position: 'absolute',
              left: anchor.x,
              top: anchor.y,
              width: anchor.w,
              maxHeight: Math.min(380, screenH - anchor.y - 32),
              borderRadius: 16,
              backgroundColor: theme.colors.bgSecondary,
              borderWidth: 1,
              borderColor: theme.colors.borderStrong,
              paddingVertical: 6,
              elevation: 8,
            }}
          >
            {label ? (
              <Text variant="small" color="textSecondary" style={{ paddingHorizontal: 14, paddingVertical: 6, fontWeight: '600' }}>{label}</Text>
            ) : null}
            <ScrollView>
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <Tap
                    key={o.value}
                    onPress={() => {
                      setOpen(false);
                      onChange(o.value);
                    }}
                    pressedColor={theme.colors.pressed}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: active ? theme.colors.brandTint : 'transparent',
                    }}
                  >
                    {o.icon ? <Image source={o.icon} style={{ width: 26, height: 26, borderRadius: 13 }} /> : null}
                    <Text variant="body" style={{ flex: 1, fontWeight: active ? '600' : '500' }}>{o.label}</Text>
                    {o.detail ? (
                      <Text variant="small" color={o.detailColor ?? 'textSecondary'} style={{ fontVariant: ['tabular-nums'] }}>{o.detail}</Text>
                    ) : null}
                    <View style={{ width: 18, alignItems: 'flex-end' }}>{active ? <Check size={16} color={theme.colors.brand} /> : null}</View>
                  </Tap>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
