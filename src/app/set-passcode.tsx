import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { PasscodeSetup } from '@/components/PasscodeSetup';
import { PatternSetup } from '@/components/PatternSetup';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export default function SetPasscode() {
  const { disableAppLock } = useAuth();
  const [mode, setMode] = useState<'passcode' | 'pattern'>('passcode');

  return (
    <AuthShell
      compactLogo
      narrow
      title="Secure your app"
      subtitle="Choose how you want to unlock SKFL on this device"
      below={
        <Pressable onPress={disableAppLock} hitSlop={10} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip for now (Use Email & Password only)</Text>
        </Pressable>
      }
    >
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setMode('passcode')}
          style={[styles.tab, mode === 'passcode' && styles.tabActive]}
        >
          <Text style={[styles.tabText, mode === 'passcode' && styles.tabTextActive]}>
            4-Digit PIN
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('pattern')}
          style={[styles.tab, mode === 'pattern' && styles.tabActive]}
        >
          <Text style={[styles.tabText, mode === 'pattern' && styles.tabTextActive]}>
            3x3 Pattern
          </Text>
        </Pressable>
      </View>

      {mode === 'passcode' ? <PasscodeSetup /> : <PatternSetup />}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  tabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabTextActive: {
    fontFamily: fonts.bold,
    color: colors.brand,
  },
  skipBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  skipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
});
