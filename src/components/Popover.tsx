/**
 * Popover — a floating panel anchored to its trigger (native take on
 * shadcn's Popover): tap the trigger, a card opens just below (or above, if
 * there's no room) with a small arrow pointing at it; tap outside to close.
 * `children` receives `close` so content can dismiss it after a choice.
 */
import React, { useRef, useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Text } from './Text';
import { useTheme } from '@/theme';

export function Popover({
  trigger,
  title,
  width = 320,
  children,
}: {
  /** What the user taps to open it. */
  trigger: React.ReactNode;
  title?: string;
  width?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const theme = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  const anchor = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 16, top: 120, arrowX: 40, above: false, maxH: 400 });

  const show = () => {
    anchor.current?.measureInWindow((x, y, w, h) => {
      const panelW = Math.min(width, W - 32);
      const left = Math.max(16, Math.min(x + w - panelW, W - 16 - panelW));
      const spaceBelow = H - (y + h) - 24;
      const above = spaceBelow < 260 && y > spaceBelow;
      setPos({
        left,
        top: above ? Math.max(24, y - 10) : y + h + 10,
        arrowX: Math.max(16, Math.min(x + w / 2 - left - 7, panelW - 30)),
        above,
        maxH: Math.max(180, above ? y - 40 : spaceBelow),
      });
      setOpen(true);
    });
  };
  const close = () => setOpen(false);
  const panelW = Math.min(width, W - 32);

  return (
    <>
      <Pressable ref={anchor} onPress={show} accessibilityRole="button" hitSlop={4}>
        {trigger}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={close}>
          <View
            onStartShouldSetResponder={() => true}
            style={{
              position: 'absolute',
              left: pos.left,
              width: panelW,
              maxHeight: pos.maxH,
              ...(pos.above ? { bottom: H - pos.top } : { top: pos.top }),
            }}
          >
            {/* arrow */}
            <View
              style={{
                position: 'absolute',
                left: pos.arrowX,
                width: 14,
                height: 14,
                transform: [{ rotate: '45deg' }],
                backgroundColor: theme.colors.bgSecondary,
                borderColor: theme.colors.borderStrong,
                borderLeftWidth: pos.above ? 0 : 1,
                borderTopWidth: pos.above ? 0 : 1,
                borderRightWidth: pos.above ? 1 : 0,
                borderBottomWidth: pos.above ? 1 : 0,
                ...(pos.above ? { bottom: -7 } : { top: -7 }),
                zIndex: 2,
              }}
            />
            <View
              style={{
                borderRadius: 18,
                backgroundColor: theme.colors.bgSecondary,
                borderWidth: 1,
                borderColor: theme.colors.borderStrong,
                padding: 12,
                elevation: 10,
              }}
            >
              {title ? (
                <Text variant="small" color="textSecondary" style={{ fontWeight: '600', paddingHorizontal: 4, marginBottom: 8 }}>
                  {title}
                </Text>
              ) : null}
              {children(close)}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
