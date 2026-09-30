import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  home: { active: 'grid', inactive: 'grid-outline' },
  tasks: { active: 'checkbox', inactive: 'checkbox-outline' },
  feedback: { active: 'chatbubbles', inactive: 'chatbubbles-outline' },
  more: { active: 'menu', inactive: 'menu-outline' },
};

const PILL_W = 52;
const SPRING = { damping: 20, stiffness: 260, mass: 0.8 };

function TabButton({
  routeName,
  label,
  isFocused,
  onPress,
  onLongPress,
}: {
  routeName: string;
  label: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const icons = TAB_ICONS[routeName] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
  const pressScale = useSharedValue(1);
  const active = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    active.set(withSpring(isFocused ? 1 : 0, SPRING));
  }, [isFocused, active]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.get() * interpolate(active.get(), [0, 1], [1, 1.08]) }, { translateY: interpolate(active.get(), [0, 1], [0, -1]) }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => pressScale.set(withTiming(0.88, { duration: 90 }))}
      onPressOut={() => pressScale.set(withSpring(1, { damping: 12, stiffness: 300 }))}
      unstable_pressDelay={0}
      android_disableSound
      accessibilityRole="tab"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={label}
      style={styles.tabItem}>
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        <Ionicons name={isFocused ? icons.active : icons.inactive} size={22} color={isFocused ? colors.brand : colors.textMuted} />
      </Animated.View>
      <Text numberOfLines={1} style={[styles.tabLabel, isFocused ? styles.tabLabelActive : styles.tabLabelInactive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function CustomTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 8);
  const count = state.routes.length;
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const tabW = width / count;

  // One pill that glides to the selected tab.
  useEffect(() => {
    if (!width) return;
    const target = state.index * tabW + (tabW - PILL_W) / 2;
    x.set(x.get() === 0 && state.index !== 0 ? target : withSpring(target, SPRING));
  }, [state.index, tabW, width, x]);

  // Mount the other tabs quietly once the app has settled, so the first visit is instant.
  const preloaded = useRef(false);
  useEffect(() => {
    if (preloaded.current) return;
    preloaded.current = true;
    const t = setTimeout(() => {
      state.routes.forEach((r, i) => {
        if (i !== state.index) navigation.dispatch({ type: 'PRELOAD', payload: { name: r.name }, target: state.key });
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [navigation, state]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={[styles.barContainer, { paddingBottom: bottomInset }]}>
      <View style={styles.barInner} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && <Animated.View pointerEvents="none" style={[styles.activePill, pillStyle]} />}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);

          const handlePress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              Haptics.selectionAsync().catch(() => {});
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TabButton
              key={route.key}
              routeName={route.name}
              label={label}
              isFocused={isFocused}
              onPress={handlePress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'none', // instant switch: no fade, no in-between frames
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
      <Tabs.Screen name="feedback" options={{ title: 'Feedback' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    paddingTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: -4 },
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  barInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    position: 'relative',
  },
  iconWrap: {
    width: 48,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    left: 0,
    top: 2,
    width: PILL_W,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.brandSoft,
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    fontFamily: fonts.bold,
    color: colors.brand,
  },
  tabLabelInactive: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
});
