import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: ColorValue }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconActive]}>
      <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={22} color={color as string} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { isBoss, isCaseHandler } = useMe();
  const complaintsTitle = isBoss || isCaseHandler ? 'Integrity' : 'Complaints';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, marginTop: 2 },
        tabBarStyle: [
          styles.bar,
          { height: 62 + Math.max(insets.bottom, Platform.OS === 'web' ? 8 : 6), paddingBottom: Math.max(insets.bottom, 8) },
        ],
        tabBarItemStyle: { paddingTop: 6 },
      }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: (p) => <TabIcon name="grid" {...p} /> }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: (p) => <TabIcon name="checkbox" {...p} /> }} />
      <Tabs.Screen name="feedback" options={{ title: 'Feedback', tabBarIcon: (p) => <TabIcon name="chatbubbles" {...p} /> }} />
      <Tabs.Screen name="complaints" options={{ title: complaintsTitle, tabBarIcon: (p) => <TabIcon name="shield-checkmark" {...p} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: (p) => <TabIcon name="menu" {...p} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
      android: { elevation: 12 },
      default: {},
    }),
  },
  iconWrap: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: colors.brandSoft },
});
