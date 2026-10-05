import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui';
import { authenticate, getAppLockSupport, type AppLockSupport } from '@/lib/appLock';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

import { PatternLock } from './PatternLock';

type Step = 'draw' | 'confirm' | 'bio';

export function PatternSetup({
  offerBiometrics = true,
  onDone,
}: {
  offerBiometrics?: boolean;
  onDone?: () => void;
}) {
  const { savePatternLock } = useAuth();
  const [step, setStep] = useState<Step>('draw');
  const [firstPattern, setFirstPattern] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [support, setSupport] = useState<AppLockSupport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAppLockSupport().then(setSupport).catch(() => {});
  }, []);

  const finish = async (patternToSave: string, bio?: boolean) => {
    setBusy(true);
    try {
      await savePatternLock(patternToSave, bio);
      onDone?.();
    } catch {
      setError('Could not save pattern. Try again.');
      setStep('draw');
      setFirstPattern('');
    } finally {
      setBusy(false);
    }
  };

  const handlePatternComplete = (pattern: string) => {
    setError(null);
    if (step === 'draw') {
      setFirstPattern(pattern);
      setStep('confirm');
      return;
    }
    if (pattern !== firstPattern) {
      setError('Patterns did not match. Try again.');
      setStep('draw');
      setFirstPattern('');
      return;
    }
    if (offerBiometrics && support?.available) {
      setStep('bio');
    } else {
      finish(pattern);
    }
  };

  if (step === 'bio' && support) {
    return (
      <Animated.View key="bio" entering={FadeInRight.duration(300)} style={{ gap: spacing.lg, alignItems: 'center' }}>
        <Animated.View entering={ZoomIn.springify()} style={styles.bioCircle}>
          <Ionicons name={support.icon} size={46} color={colors.brand} />
        </Animated.View>
        <Text style={styles.title}>Use {support.method.toLowerCase()} too?</Text>
        <Text style={styles.sub}>Unlock SKFL with just a touch. Your pattern always works as a backup.</Text>
        <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
          <Button
            title={`Turn on ${support.method.toLowerCase()}`}
            icon={support.icon}
            size="lg"
            loading={busy}
            onPress={async () => {
              const r = await authenticate(`Turn on ${support.method.toLowerCase()} unlock`);
              if (r.ok) finish(firstPattern, true);
              else if (r.error) setError(r.error);
            }}
          />
          <Button title="Not now" variant="ghost" disabled={busy} onPress={() => finish(firstPattern, false)} />
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </Animated.View>
    );
  }

  return (
    <View style={{ alignItems: 'center', gap: spacing.md }}>
      <View style={styles.progress}>
        <View style={[styles.seg, styles.segOn]} />
        <View style={[styles.seg, step === 'confirm' && styles.segOn]} />
      </View>
      <Animated.View key={step} entering={FadeInRight.duration(300)} style={{ alignItems: 'center', gap: spacing.xs }}>
        <View style={styles.badge}>
          <Ionicons name={step === 'draw' ? 'grid-outline' : 'shield-checkmark'} size={20} color={colors.brand} />
        </View>
        <Text style={styles.title}>{step === 'draw' ? 'Draw your pattern' : 'Confirm your pattern'}</Text>
        <Text style={styles.sub}>
          {step === 'draw' ? 'Connect at least 4 dots in any direction' : 'Draw the same pattern again'}
        </Text>
      </Animated.View>

      <PatternLock
        onPatternComplete={handlePatternComplete}
        minPoints={4}
        disabled={busy}
        error={error}
        size={280}
        tone="light"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  segOn: { backgroundColor: colors.gold },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: { fontFamily: fonts.bold, fontSize: 19, color: colors.text, textAlign: 'center' },
  sub: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center', maxWidth: 300 },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.danger, textAlign: 'center', minHeight: 18 },
  bioCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.brandSoft,
    borderWidth: 1.5,
    borderColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
