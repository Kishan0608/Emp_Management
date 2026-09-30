import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useMe } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  home: { active: 'grid', inactive: 'grid-outline' },
  tasks: { active: 'checkbox', inactive: 'checkbox-outline' },
  feedback: { active: 'chatbubbles', inactive: 'chatbubbles-outline' },
  complaints: { active: 'shield-checkmark', inactive: 'shield-checkmark-outline' },
  more: { active: 'menu', inactive: 'menu-outline' },
};

function TabButton({
  routeKey,
  routeName,
  label,
  isFocused,
  onPress,
  onLongPress,
}: {
  routeKey: string;
  routeName: string;
  label: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const icons = TAB_ICONS[routeName] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
  const pressScale = useSharedValue(1);
  const activeAnim = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    activeAnim.value = withSpring(isFocused ? 1 : 0, {
      damping: 18,
      stiffness: 240,
    });
  }, [isFocused, activeAnim]);

  const animatedPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(activeAnim.value, [0, 1], [1, 1.1]) }],
  }));

  const animatedPillStyle = useAnimatedStyle(() => ({
    opacity: activeAnim.value,
    transform: [
      { scaleX: interpolate(activeAnim.value, [0, 1], [0.8, 1]) },
      { scaleY: interpolate(activeAnim.value, [0, 1], [0.8, 1]) },
    ],
  }));

  const handlePressIn = () => {
    pressScale.value = withTiming(0.92, { duration: 80 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 14, stiffness: 260 });
  };

  return (
    <Pressable
      key={routeKey}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      unstable_pressDelay={0}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={label}
      style={styles.tabItem}>
      {/* Icon + Active pill container */}
      <Animated.View style={[styles.iconWrap, animatedPressStyle]}>
        {/* Soft champagne-gold pill */}
        <Animated.View style={[styles.activePill, animatedPillStyle]} />

        {/* Scaled Icon */}
        <Animated.View style={animatedIconStyle}>
          <Ionicons
            name={isFocused ? icons.active : icons.inactive}
            size={22}
            color={isFocused ? colors.brand : colors.textMuted}
          />
        </Animated.View>
      </Animated.View>

      {/* Label */}
      <Text
        numberOfLines={1}
        style={[
          styles.tabLabel,
          isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function CustomTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 8);

  return (
    <View style={[styles.barContainer, { paddingBottom: bottomInset }]}>
      <View style={styles.barInner}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const handlePress = () => {
            if (!isFocused) {
              navigation.navigate(route.name, route.params);
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
          };

          const handleLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TabButton
              key={route.key}
              routeKey={route.key}
              routeName={route.name}
              label={label}
              isFocused={isFocused}
              onPress={handlePress}
              onLongPress={handleLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { isBoss, isCaseHandler } = useMe();
  const complaintsTitle = isBoss || isCaseHandler ? 'Integrity' : 'Complaints';

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'none',
      }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
      <Tabs.Screen name="feedback" options={{ title: 'Feedback' }} />
      <Tabs.Screen name="complaints" options={{ title: complaintsTitle }} />
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
    width: 48,
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
