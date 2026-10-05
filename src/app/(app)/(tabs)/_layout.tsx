import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  tasks: { active: 'checkbox', inactive: 'checkbox-outline' },
  attendance: { active: 'time', inactive: 'time-outline' },
  home: { active: 'home', inactive: 'home-outline' },
  feedback: { active: 'chatbubbles', inactive: 'chatbubbles-outline' },
  more: { active: 'menu', inactive: 'menu-outline' },
};

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
  const isHome = routeName === 'home';
  const icons = TAB_ICONS[routeName] ?? { active: 'ellipse', inactive: 'ellipse-outline' };

  if (isHome) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        unstable_pressDelay={0}
        android_disableSound
        accessibilityRole="tab"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={label}
        hitSlop={{ top: 14, bottom: 4, left: 10, right: 10 }}
        style={({ pressed }) => [
          styles.tabItem,
          styles.centerTabItem,
          pressed && { opacity: 0.88, transform: [{ scale: 0.95 }] },
        ]}>
        <View
          style={[
            styles.centerIconCircle,
            isFocused ? styles.centerIconCircleActive : styles.centerIconCircleInactive,
          ]}>
          <Ionicons
            name={isFocused ? icons.active : icons.inactive}
            size={24}
            color={isFocused ? colors.white : colors.textSecondary}
          />
        </View>
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

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      unstable_pressDelay={0}
      android_disableSound
      accessibilityRole="tab"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tabItem, pressed && styles.tabItemPressed]}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={isFocused ? icons.active : icons.inactive}
          size={22}
          color={isFocused ? colors.brand : colors.textMuted}
        />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.tabLabel, isFocused ? styles.tabLabelActive : styles.tabLabelInactive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function CustomTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState(windowWidth);
  const width = layoutWidth || windowWidth;
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8);
  const barHeight = 58;
  const totalHeight = barHeight + bottomInset;

  // Mountain geometry:
  // The baseline of the tab bar is at y = 0 of the container.
  // In the SVG, we place y_base at 22 so that the top edge on left & right is at container y = 0.
  // The mountain peak curves smoothly UP to y_peak = 2 (which is container y = -20).
  // The entire area below the line is filled with solid colors.surface (white).
  // This guarantees ZERO gap on the left and right where page content or background can peek through!
  const y_base = 22;
  const y_peak = 2;
  const svgHeight = totalHeight + y_base;
  const cx = width / 2;
  const mountainHalfWidth = 58;
  const leftRamp = cx - mountainHalfWidth;
  const rightRamp = cx + mountainHalfWidth;

  // Single continuous seamless mountain curve path with exact C1 horizontal tangents
  const borderPath = `M 0,${y_base} L ${leftRamp},${y_base} C ${cx - 38},${y_base} ${cx - 24},${y_peak} ${cx},${y_peak} C ${cx + 24},${y_peak} ${cx + 38},${y_base} ${rightRamp},${y_base} L ${width},${y_base}`;

  // Solid white fill spanning from the mountain line all the way to the bottom edge
  const bgPath = `${borderPath} L ${width},${svgHeight} L 0,${svgHeight} Z`;

  return (
    <View
      style={[styles.barContainer, { height: totalHeight }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w && w !== layoutWidth) setLayoutWidth(w);
      }}>
      {/* Seamless mountain SVG background and continuous top border */}
      <Svg
        width={width}
        height={svgHeight}
        style={[
          styles.svgBackground,
          {
            top: -y_base,
            height: svgHeight,
            width,
          },
        ]}
        pointerEvents="none">
        <Path d={bgPath} fill={colors.surface} />
        <Path d={borderPath} fill="none" stroke={colors.border} strokeWidth={1.5} />
      </Svg>

      <View style={[styles.barInner, { height: barHeight }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);

          const handlePress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
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
      initialRouteName="home"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'none',
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="feedback" options={{ title: 'Support' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'visible',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
      },
      android: {
        elevation: 8,
      },
      default: {
        filter: 'drop-shadow(0px -2px 6px rgba(0, 0, 0, 0.04))',
      },
    }),
  },
  svgBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  barInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    zIndex: 2,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    position: 'relative',
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  centerTabItem: {
    zIndex: 3,
    overflow: 'visible',
  },
  centerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  centerIconCircleActive: {
    backgroundColor: colors.brand,
    borderWidth: 2.5,
    borderColor: colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: colors.brand,
        shadowOpacity: 0.4,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 6,
      },
      default: {
        boxShadow: '0 4px 12px rgba(125, 110, 34, 0.35)',
      } as any,
    }),
  },
  centerIconCircleInactive: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 32,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 10.5,
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
