import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInRight, ZoomIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthLink, OtpInput, ResendButton } from '@/components/auth-kit';
import { AuthShell } from '@/components/AuthShell';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { api, errorMessage, type OnboardingOptions, type OnboardingState } from '@/lib/api';
import { roleLabel } from '@/lib/format';
import type { Role } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, shadow, spacing } from '@/theme/tokens';

const STEPS = ['Email', 'Key', 'Profile', 'Approval'] as const;
const stepIndex = (s: OnboardingState['status']) =>
  s === 'email_pending' ? 0 : s === 'email_verified' || s === 'invited' ? 1 : s === 'key_verified' ? 2 : s === 'approver_pending' ? 3 : 4;

/** Self sign-up wizard: email code → admin key / QR → profile → approver code. */
export default function Onboarding() {
  const { refresh, signOut } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api.onboardingState());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    api
      .onboardingState()
      .then(setState)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const finish = async () => {
    setDone(true);
    setTimeout(() => refresh(), 1800);
  };

  if (!state) {
    return (
      <AuthShell compactLogo title="Setting up" subtitle="One moment…">
        {error ? <Banner tone="danger">{error}</Banner> : <ActivityIndicator color={colors.brand} />}
      </AuthShell>
    );
  }

  const idx = done ? 4 : stepIndex(state.status);
  const title = done ? 'You’re all set!' : ['Verify your email', 'Enter your key', 'Your details', 'Confirm with your manager'][idx] ?? 'Almost done';
  const subtitle = done
    ? 'Your account is active. From now on just sign in.'
    : [
        `Enter the 6-digit code we sent to ${state.code_sent_to ?? state.email}`,
        'Your administrator has been notified. Enter the key or scan the QR they give you.',
        'As written in your offer letter. All fields are required.',
        `We emailed a code to ${state.approver_name ?? 'the person you report to'}. Ask them for it.`,
      ][idx] ?? '';

  return (
    <AuthShell compactLogo title={title} subtitle={subtitle} below={!done && <AuthLink lead="Not you?" action="Sign out" onPress={() => signOut()} />}>
      <Stepper index={idx} />
      {done ? (
        <Animated.View entering={ZoomIn.springify()} style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <View style={styles.doneCircle}>
            <Ionicons name="checkmark" size={46} color={colors.white} />
          </View>
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
        </Animated.View>
      ) : (
        <Animated.View key={state.status} entering={FadeInRight.duration(350)} style={{ gap: spacing.lg }}>
          {error && <Banner tone="danger">{error}</Banner>}
          {idx === 0 && <EmailStep state={state} onDone={load} setError={setError} />}
          {idx === 1 && <KeyStep onDone={load} setError={setError} />}
          {idx === 2 && <ProfileStep state={state} onDone={load} setError={setError} />}
          {idx === 3 && <ApproverStep state={state} onDone={finish} onChange={load} setError={setError} />}
        </Animated.View>
      )}
    </AuthShell>
  );
}

function Stepper({ index }: { index: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(Math.min(index, 3) / 3, { duration: 600 }));
  }, [index, p]);
  const bar = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.track}>
        <Animated.View style={[styles.trackFill, bar]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {STEPS.map((s, i) => {
          const complete = i < index;
          const current = i === index;
          return (
            <View key={s} style={{ alignItems: 'center', gap: 4, flex: 1 }}>
              <View style={[styles.dot, complete && styles.dotDone, current && styles.dotCurrent]}>
                {complete ? <Ionicons name="checkmark" size={13} color={colors.white} /> : <Text style={[styles.dotNum, current && { color: colors.ink }]}>{i + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, (complete || current) && { color: colors.text }]}>{s}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------- step 1: email code ----------
function EmailStep({ state, onDone, setError }: { state: OnboardingState; onDone: () => void; setError: (e: string | null) => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);

  const verify = async (c = code) => {
    setBusy(true);
    setError(null);
    setBad(false);
    try {
      await api.verifyEmail(c);
      toast('Email verified');
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBad(true);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const recipientEmail = state.code_sent_to ?? state.email;

  return (
    <>
      <View style={styles.emailHeroCard}>
        <View style={styles.emailIconBadge}>
          <Ionicons name="mail-unread-outline" size={26} color={colors.brand} />
        </View>
        <Text style={styles.emailHeroTitle}>Enter Verification Code</Text>
        <Text style={styles.emailHeroSubtitle}>We sent a 6-digit confirmation code to your email address:</Text>
        <View style={styles.emailBadge}>
          <Ionicons name="mail" size={14} color={colors.brand} />
          <Text style={styles.emailBadgeText} numberOfLines={1}>{recipientEmail}</Text>
        </View>
      </View>

      <OtpInput
        value={code}
        error={bad}
        onChange={(v) => {
          setCode(v);
          setBad(false);
          if (v.length === 6) verify(v);
        }}
      />

      <View style={styles.securityHint}>
        <Ionicons name="shield-checkmark-outline" size={15} color={colors.textMuted} />
        <Text style={styles.securityHintText}>Code valid for 10 minutes · Check spam or junk folder if needed</Text>
      </View>

      <Button title="Verify email" icon="shield-checkmark" size="lg" loading={busy} disabled={code.length !== 6} onPress={() => verify()} />
      <ResendButton
        initialWait={60}
        onResend={async () => {
          try {
            const r = await api.sendCode('email');
            toast(`A new code was sent to ${r.sent_to}`, 'info');
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </>
  );
}

// ---------- step 2: key or QR ----------
function formatKey(t: string) {
  const raw = t.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SKFL/, '').slice(0, 8);
  return raw.length === 0 ? '' : `SKFL-${raw.slice(0, 4)}${raw.length > 4 ? '-' + raw.slice(4) : ''}`;
}

function KeyStep({ onDone, setError }: { onDone: () => void; setError: (e: string | null) => void }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  const verify = async (k = key) => {
    setBusy(true);
    setError(null);
    try {
      await api.verifyKey(k);
      toast('Key accepted');
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={styles.waitCard}>
        <Ionicons name="notifications-outline" size={22} color={colors.brand} />
        <AppText variant="small" style={{ flex: 1 }}>
          Your administrator got a notification. They will give you a key like SKFL-XXXX-XXXX or show you a QR code.
        </AppText>
      </View>
      <TextField
        label="Activation key"
        icon="key-outline"
        value={key}
        onChangeText={(t) => setKey(formatKey(t))}
        placeholder="SKFL-XXXX-XXXX"
        autoCapitalize="characters"
        autoCorrect={false}
        style={{ fontFamily: fonts.semibold, letterSpacing: 2 }}
      />
      <Button title="Verify key" icon="checkmark-circle" size="lg" loading={busy} disabled={!/^SKFL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)} onPress={() => verify()} />
      <Button title="Scan QR code instead" icon="qr-code-outline" variant="outline" onPress={() => setScanning(true)} />
      {scanning && (
        <QrScanner
          onClose={() => setScanning(false)}
          onScan={(text) => {
            setScanning(false);
            const k = formatKey(text.replace(/^.*?(SKFL-?[A-Z0-9]{4}-?[A-Z0-9]{4}).*$/i, '$1'));
            setKey(k);
            if (/^SKFL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k)) verify(k);
            else setError('That QR code is not an SKFL key.');
          }}
        />
      )}
    </>
  );
}

function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {!permission?.granted ? (
          <View style={styles.permission}>
            <Ionicons name="camera-outline" size={40} color={colors.goldLight} />
            <Text style={styles.permText}>Allow the camera to scan the QR code from your administrator.</Text>
            <Button title="Allow camera" onPress={requestPermission} />
            <Button title="Cancel" variant="ghost" onPress={onClose} />
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={
                handled
                  ? undefined
                  : ({ data }) => {
                      setHandled(true);
                      onScan(data);
                    }
              }
            />
            <Animated.View entering={FadeIn} style={styles.scanFrameWrap} pointerEvents="none">
              <View style={styles.scanFrame} />
              <Text style={styles.scanHint}>Point at the QR code</Text>
            </Animated.View>
            <Pressable onPress={onClose} style={[styles.closeBtn, { top: insets.top + 12 }]} accessibilityLabel="Close scanner">
              <Ionicons name="close" size={26} color={colors.white} />
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

function getDeptIcon(name: string): any {
  const lower = name.toLowerCase();
  if (lower.includes('eng')) return 'construct-outline';
  if (lower.includes('op')) return 'cog-outline';
  if (lower.includes('hr') || lower.includes('human') || lower.includes('people')) return 'people-outline';
  if (lower.includes('sale') || lower.includes('market')) return 'trending-up-outline';
  if (lower.includes('fin') || lower.includes('account')) return 'cash-outline';
  if (lower.includes('qual') || lower.includes('qa')) return 'shield-checkmark-outline';
  return 'business-outline';
}

interface DropdownItem {
  value: string;
  label: string;
  sublabel?: string | null;
  icon?: any;
}

function ConnectedDropdown({
  label,
  value,
  onChange,
  options,
  placeholder,
  icon,
  isOpen,
  onToggle,
}: {
  label: string;
  value: string | null;
  onChange: (val: string) => void;
  options: DropdownItem[];
  placeholder: string;
  icon?: any;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const selected = options.find((o) => o.value === value);

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={onToggle}
        style={[styles.ddlTrigger, isOpen && styles.ddlTriggerActive]}>
        {icon && <Ionicons name={icon} size={18} color={isOpen ? colors.brand : colors.textMuted} />}
        <Text style={[styles.ddlTriggerText, !selected && { color: colors.textMuted }]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={isOpen ? colors.brand : colors.textMuted} />
      </Pressable>

      {isOpen && (
        <View style={styles.ddlContainer}>
          <ScrollView
            nestedScrollEnabled
            style={{ maxHeight: 220 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}>
            {options.length === 0 ? (
              <View style={{ padding: spacing.md, alignItems: 'center' }}>
                <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted }}>No options available</Text>
              </View>
            ) : (
              options.map((item, idx) => {
              const active = item.value === value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => {
                    onChange(item.value);
                    onToggle();
                  }}
                  style={({ pressed }) => [
                    styles.ddlOption,
                    active && styles.ddlOptionActive,
                    pressed && styles.ddlOptionPressed,
                    idx < options.length - 1 && styles.ddlOptionBorder,
                  ]}>
                  {item.icon && (
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={active ? colors.brand : colors.textMuted}
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ddlOptionTitle, active && styles.ddlOptionTitleActive]}>
                      {item.label}
                    </Text>
                    {item.sublabel && (
                      <Text style={styles.ddlOptionSubtitle}>{item.sublabel}</Text>
                    )}
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={18} color={colors.brand} />}
                </Pressable>
              );
            })
          )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ---------- step 3: profile ----------
function ProfileStep({ state, onDone, setError }: { state: OnboardingState; onDone: () => void; setError: (e: string | null) => void }) {
  const [opts, setOpts] = useState<OnboardingOptions | null>(null);
  const [first, setFirst] = useState(state.first_name ?? '');
  const [last, setLast] = useState(state.last_name ?? '');
  const [title, setTitle] = useState('');
  const [dept, setDept] = useState<string | null>(null);
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('employee');
  const [busy, setBusy] = useState(false);
  const [openDdl, setOpenDdl] = useState<'dept' | 'reportsTo' | 'role' | null>(null);

  useEffect(() => {
    api.onboardingOptions()
      .then(setOpts)
      .catch(async () => {
        try {
          const dList = await api.departments();
          setOpts({ departments: dList, approvers: [] });
        } catch {
          setOpts({
            departments: [
              { id: '11111111-1111-4111-8111-111111111111', name: 'Engineering' },
              { id: '22222222-2222-4222-8222-222222222222', name: 'Operations' },
              { id: '33333333-3333-4333-8333-333333333333', name: 'Human Resources' },
            ],
            approvers: [],
          });
        }
      });
  }, []);

  const approver = useMemo(() => opts?.approvers.find((a) => a.id === reportsTo), [opts, reportsTo]);
  const roleProblem = approver && (role === 'manager' || role === 'hr') && approver.role === 'manager' ? 'A Manager or HR account must report to HR or the Boss.' : null;
  const valid = first.trim().length >= 2 && last.trim().length >= 1 && title.trim().length >= 2 && !!dept && !!reportsTo && !roleProblem;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.submitProfile({ first, last, jobTitle: title, departmentId: dept!, reportsTo: reportsTo!, role });
      await api.sendCode('approver');
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!opts) return <ActivityIndicator color={colors.brand} style={{ paddingVertical: spacing.xxl }} />;

  return (
    <>
      {/* Section 1: Personal Details */}
      <View style={styles.formSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconCircle}>
            <Ionicons name="person-outline" size={16} color={colors.brand} />
          </View>
          <Text style={styles.sectionTitle}>Personal Details</Text>
        </View>

        <TextField
          label="First name *"
          icon="person-outline"
          value={first}
          onChangeText={setFirst}
          placeholder="e.g. Aarav"
          autoCapitalize="words"
        />

        <TextField
          label="Surname / Last name *"
          icon="person-outline"
          value={last}
          onChangeText={setLast}
          placeholder="e.g. Sharma"
          autoCapitalize="words"
        />
      </View>

      {/* Section 2: Company Placement */}
      <View style={styles.formSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconCircle}>
            <Ionicons name="business-outline" size={16} color={colors.brand} />
          </View>
          <Text style={styles.sectionTitle}>Company Placement</Text>
        </View>

        <TextField
          label="Job title *"
          icon="briefcase-outline"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Quality Control Executive"
          autoCapitalize="words"
        />

        {/* Company Placement */}
        {opts.organization && (
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Company</Text>
            <View style={[styles.ddlTrigger, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Ionicons name="business" size={18} color={colors.brand} />
              <Text style={[styles.ddlTriggerText, { fontFamily: fonts.semibold }]}>
                {opts.organization.name}
              </Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            </View>
          </View>
        )}

        {/* Department DDL */}
        <ConnectedDropdown
          label="Department *"
          icon="business-outline"
          placeholder="Choose department"
          value={dept}
          onChange={setDept}
          options={opts.departments.map((d) => ({
            value: d.id,
            label: d.name,
            icon: getDeptIcon(d.name),
          }))}
          isOpen={openDdl === 'dept'}
          onToggle={() => setOpenDdl(openDdl === 'dept' ? null : 'dept')}
        />

        {/* Reports to DDL */}
        <ConnectedDropdown
          label="Reports to *"
          icon="people-outline"
          placeholder="Choose your manager, HR or Boss"
          value={reportsTo}
          onChange={setReportsTo}
          options={opts.approvers.map((a) => ({
            value: a.id,
            label: a.full_name,
            sublabel: [roleLabel[a.role], a.job_title, a.department].filter(Boolean).join(' · '),
            icon: a.role === 'boss' ? 'shield-checkmark-outline' : a.role === 'hr' ? 'id-card-outline' : 'people-outline',
          }))}
          isOpen={openDdl === 'reportsTo'}
          onToggle={() => setOpenDdl(openDdl === 'reportsTo' ? null : 'reportsTo')}
        />

        {/* Your role DDL */}
        <ConnectedDropdown
          label="Your role *"
          icon="id-card-outline"
          placeholder="Choose your role"
          value={role}
          onChange={(val) => setRole(val as Role)}
          options={[
            { value: 'employee', label: 'Employee', sublabel: 'Standard team member access', icon: 'person-outline' },
            { value: 'manager', label: 'Manager', sublabel: 'Team tasks & performance reviews', icon: 'people-outline' },
            { value: 'hr', label: 'HR', sublabel: 'Employee directory & onboarding', icon: 'id-card-outline' },
          ]}
          isOpen={openDdl === 'role'}
          onToggle={() => setOpenDdl(openDdl === 'role' ? null : 'role')}
        />
      </View>

      {roleProblem && <Banner tone="warning">{roleProblem}</Banner>}
      <Button title="Submit & send code to approver" icon="arrow-forward" size="lg" loading={busy} disabled={!valid} onPress={submit} />
    </>
  );
}

// ---------- step 4: approver code ----------
function ApproverStep({ state, onDone, onChange, setError }: { state: OnboardingState; onDone: () => void; onChange: () => void; setError: (e: string | null) => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const [editing, setEditing] = useState(false);

  const confirm = async (c = code) => {
    setBusy(true);
    setError(null);
    setBad(false);
    try {
      await api.confirmApprover(c);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBad(true);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (editing) return <ProfileStep state={state} onDone={() => { setEditing(false); onChange(); }} setError={setError} />;

  return (
    <>
      <View style={styles.approverCard}>
        <Ionicons name="mail-open-outline" size={22} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.text }}>{state.approver_name}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary }}>
            {state.approver_role ? roleLabel[state.approver_role] : ''} · {state.code_sent_to ?? 'email sent'}
          </Text>
        </View>
      </View>
      <OtpInput
        value={code}
        error={bad}
        onChange={(v) => {
          setCode(v);
          setBad(false);
          if (v.length === 6) confirm(v);
        }}
      />
      <Button title="Activate my account" icon="checkmark-done" size="lg" loading={busy} disabled={code.length !== 6} onPress={() => confirm()} />
      <ResendButton
        onResend={async () => {
          try {
            await api.sendCode('approver');
            toast('A new code was emailed to your approver', 'info');
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
      <Pressable onPress={() => setEditing(true)} style={{ alignSelf: 'center' }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary }}>Wrong person or details? Edit my details</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: colors.gold },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotCurrent: { backgroundColor: colors.goldLight, borderColor: colors.gold },
  dotNum: { fontFamily: fonts.bold, fontSize: 12, color: colors.textMuted },
  stepLabel: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.textMuted },
  waitCard: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandTint },
  approverCard: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  doneCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xxl },
  permText: { fontFamily: fonts.medium, fontSize: 15, color: colors.white, textAlign: 'center' },
  scanFrameWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  scanFrame: { width: 240, height: 240, borderRadius: 24, borderWidth: 3, borderColor: colors.goldLight },
  scanHint: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  closeBtn: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  emailHeroCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  emailIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brandSoft,
    borderWidth: 1.5,
    borderColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emailHeroTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
  },
  emailHeroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  emailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandTint,
  },
  emailBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.brand,
  },
  securityHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
  },
  securityHintText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  formSection: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xxs,
  },
  sectionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
    letterSpacing: -0.2,
  },
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.text,
  },
  ddlTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ddlTriggerActive: {
    borderColor: colors.brand,
    backgroundColor: '#FFFDF7',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  ddlTriggerText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  ddlContainer: {
    marginTop: -1.5,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.md,
  },
  ddlOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  ddlOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ddlOptionActive: {
    backgroundColor: colors.brandSoft,
  },
  ddlOptionPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  ddlOptionTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
  },
  ddlOptionTitleActive: {
    fontFamily: fonts.bold,
    color: colors.brand,
  },
  ddlOptionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
