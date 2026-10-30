import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  Home,
  TrendingUp,
  ArrowLeftRight,
  User,
  Settings,
} from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useGsapValue } from '@/hooks/useGsapValue';
import { useOrderWatcher } from '@/hooks/useOrderWatcher';

// ── Settings header button ────────────────────────────────────
function SettingsButton() {
  const theme = useTheme();
  const router = useRouter();
  const scale = useGsapValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.sharedValue.value }],
  }));

  return (
    <Pressable
      id="settings-header-btn"
      onPressIn={() => scale.tweenTo(0.88, { duration: 0.1 })}
      onPressOut={() => scale.tweenTo(1, { duration: 0.15 })}
      onPress={() => router.push('/settings')}
      style={{ marginRight: 14, padding: 4 }}
    >
      <Animated.View style={animStyle}>
        <Settings
          size={22}
          color={theme.colors.textSecondary}
          strokeWidth={1.8}
        />
      </Animated.View>
    </Pressable>
  );
}

// ── Animated tab icon ─────────────────────────────────────────
function TabIcon({
  icon: Icon,
  color,
  size,
  focused,
}: {
  icon: React.ElementType;
  color: string;
  size: number;
  focused: boolean;
}) {
  const scale = useGsapValue(1);

  React.useEffect(() => {
    if (focused) {
      scale.tweenTo(1.15, { duration: 0.18, ease: 'back.out(1.7)' });
    } else {
      scale.tweenTo(1, { duration: 0.15 });
    }
  }, [focused]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.sharedValue.value }],
  }));
  const theme = useTheme();

  return (
    <Animated.View
      style={[
        {
          width: 48,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? theme.colors.brandTint : 'transparent',
        },
        animStyle,
      ]}
    >
      <Icon size={size - 2} color={color} strokeWidth={focused ? 2.2 : 1.6} />
    </Animated.View>
  );
}

// ── Tabs layout ───────────────────────────────────────────────
export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Fills limit orders while the unlocked wallet is open.
  useOrderWatcher();

  // Edge-to-edge (Android 15+) draws under the system nav bar, so the bar
  // has to clear the bottom inset itself, plus a little lift above it.
  const bottomLift = Math.max(insets.bottom, 8) + 10;
  // Dark rounded bar after the Figma reference; stays in layout flow (not
  // absolute) so no screen needs extra bottom padding.
  const tabBarStyle = {
    backgroundColor: theme.colors.bgSecondary,
    borderTopColor:  theme.colors.border,
    borderTopWidth:  1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height:          64 + bottomLift,
    paddingBottom:   bottomLift,
    paddingTop:      10,
    elevation:       0,
  };

  const headerStyle = {
    backgroundColor: theme.colors.bgPrimary,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
  };

  const sharedHeaderOptions = {
    headerStyle,
    headerTintColor: theme.colors.textPrimary,
    headerShadowVisible: false,
    headerRight: () => <SettingsButton />,
  };

  return (
    <Tabs
      screenOptions={{
        tabBarStyle,
        tabBarActiveTintColor:   theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.textDisabled,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: -2,
        },
        ...sharedHeaderOptions,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          // Home draws its own top bar (avatar + settings) over the glow.
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon icon={Home} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="trade"
        options={{
          title: 'Trade',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon icon={TrendingUp} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="swap"
        options={{
          title: 'Swap',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon icon={ArrowLeftRight} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon icon={User} color={color} size={size} focused={focused} />
          ),
        }}
      />
      {/* Hide old screens that still exist as files */}
      <Tabs.Screen name="wallet"   options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="assistant" options={{ href: null }} />
    </Tabs>
  );
}
