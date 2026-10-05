import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { colors, fonts, radius, shadow, spacing } from '@/theme/tokens';

/** Centered pop-up used for the date and time pickers, so they are always fully on screen. */
export function PickerDialog({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { width } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdropWrap}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.dialog, { width: Math.min(360, width - 32) }]}>
          <Text style={styles.dialogTitle}>{title}</Text>
          {children}
          {footer && <View style={styles.footer}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

export function DialogButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.btn, primary && styles.btnPrimary, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

type Period = 'AM' | 'PM';
export interface TimeValue {
  hour: number; // 1-12
  minute: number; // 0-59
  period: Period;
}

const SIZE = 248;
const C = SIZE / 2;
const R = 94; // radius of the number ring
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/**
 * Clock-face time picker: tap an hour on the dial, it moves on to minutes,
 * tap a minute, pick AM / PM, then OK.
 */
export function TimeDialog({ visible, initial, onCancel, onConfirm }: { visible: boolean; initial: TimeValue; onCancel: () => void; onConfirm: (v: TimeValue) => void }) {
  return (
    <PickerDialog visible={visible} title="Select time" onClose={onCancel}>
      {visible && <ClockBody initial={initial} onCancel={onCancel} onConfirm={onConfirm} />}
    </PickerDialog>
  );
}

function ClockBody({ initial, onCancel, onConfirm }: { initial: TimeValue; onCancel: () => void; onConfirm: (v: TimeValue) => void }) {
  const [v, setV] = useState<TimeValue>(initial);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');

  const angle = mode === 'hour' ? (v.hour % 12) * 30 : v.minute * 6;
  const values = mode === 'hour' ? HOURS : MINUTES;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={{ gap: spacing.lg, alignItems: 'center' }}>
      {/* digital readout */}
      <View style={styles.readout}>
        <Pressable onPress={() => setMode('hour')} style={[styles.seg, mode === 'hour' && styles.segOn]} accessibilityLabel="Edit hour">
          <Text style={[styles.segText, mode === 'hour' && styles.segTextOn]}>{pad(v.hour)}</Text>
        </Pressable>
        <Text style={styles.colon}>:</Text>
        <Pressable onPress={() => setMode('minute')} style={[styles.seg, mode === 'minute' && styles.segOn]} accessibilityLabel="Edit minute">
          <Text style={[styles.segText, mode === 'minute' && styles.segTextOn]}>{pad(v.minute)}</Text>
        </Pressable>
        <View style={styles.periodCol}>
          {(['AM', 'PM'] as const).map((p) => (
            <Pressable key={p} onPress={() => setV({ ...v, period: p })} style={[styles.period, v.period === p && styles.periodOn]}>
              <Text style={[styles.periodText, v.period === p && styles.periodTextOn]}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* dial */}
      <View style={styles.dial}>
        <View style={[styles.hand, { transform: [{ rotate: `${angle - 90}deg` }] }]}>
          <View style={styles.handArm} />
          <View style={styles.handTip} />
        </View>
        <View style={styles.centerDot} />
        {values.map((n, i) => {
          const a = ((i * 30 - 90) * Math.PI) / 180;
          const selected = mode === 'hour' ? v.hour === n : v.minute === n;
          return (
            <Pressable
              key={n}
              onPress={() => {
                if (mode === 'hour') {
                  setV({ ...v, hour: n });
                  setMode('minute');
                } else setV({ ...v, minute: n });
              }}
              accessibilityLabel={mode === 'hour' ? `${n} o'clock` : `${n} minutes`}
              style={[styles.num, { left: C + R * Math.cos(a) - 18, top: C + R * Math.sin(a) - 18 }, selected && styles.numOn]}>
              <Text style={[styles.numText, selected && styles.numTextOn]}>{mode === 'minute' ? pad(n) : n}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>{mode === 'hour' ? 'Tap the hour' : 'Tap the minutes'}</Text>

      <View style={[styles.footer, { alignSelf: 'stretch' }]}>
        <DialogButton label="Cancel" onPress={onCancel} />
        <DialogButton label="OK" primary onPress={() => onConfirm(v)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  backdrop: { backgroundColor: 'rgba(15,14,12,0.55)' },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md, ...shadow.lg },
  dialogTitle: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textSecondary },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  btn: { paddingHorizontal: spacing.lg, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.brand },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brand },
  btnTextPrimary: { color: colors.white },

  readout: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  seg: { paddingHorizontal: 14, height: 68, minWidth: 88, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.brandSoft, borderWidth: 1.5, borderColor: colors.brand },
  segText: { fontFamily: fonts.semibold, fontSize: 40, color: colors.text },
  segTextOn: { color: colors.brand },
  colon: { fontFamily: fonts.semibold, fontSize: 40, color: colors.text, marginTop: -4 },
  periodCol: { marginLeft: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  period: { paddingHorizontal: 12, height: 34, alignItems: 'center', justifyContent: 'center' },
  periodOn: { backgroundColor: colors.brandSoft },
  periodText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted },
  periodTextOn: { color: colors.brand },

  dial: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.surfaceAlt },
  hand: { position: 'absolute', left: C - R, top: C - 1, width: R * 2, height: 2, flexDirection: 'row' },
  handArm: { position: 'absolute', left: R, width: R - 18, height: 2, backgroundColor: colors.brand },
  handTip: { position: 'absolute', left: R * 2 - 22, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  centerDot: { position: 'absolute', left: C - 4, top: C - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  num: { position: 'absolute', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  numOn: { backgroundColor: colors.brand },
  numText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  numTextOn: { color: colors.white, fontFamily: fonts.bold },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: -spacing.sm },
});
