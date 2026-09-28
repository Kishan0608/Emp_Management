import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, shadow, spacing } from '@/theme/tokens';

type Kind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});

const ICONS: Record<Kind, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};
const TINT: Record<Kind, string> = { success: colors.success, error: colors.danger, info: colors.brand };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, kind: Kind = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), kind, message });
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(
        kind === 'error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    }
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 4500 : 2800);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <View pointerEvents="none" style={[styles.host, { top: insets.top + spacing.sm }]}>
          <Animated.View key={toast.id} entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp} style={styles.toast}>
            <Ionicons name={ICONS[toast.kind]} size={20} color={TINT[toast.kind]} />
            <Text style={styles.text}>{toast.message}</Text>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.lg, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 520,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.lg,
  },
  text: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.text },
});
