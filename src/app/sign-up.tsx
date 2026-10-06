import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthLink, GoogleButton, OrDivider, PasswordStrength, passwordMeetsRules } from '@/components/auth-kit';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, TextField } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { loadOrganizationsFast, peekOrganizations } from '@/lib/orgCache';
import type { Organization } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, radius, shadow, spacing } from '@/theme/tokens';

/** Step 1 of self sign-up with organization selection from DB. */
export default function SignUp() {
  const { signIn, signInWithGoogle } = useAuth();
  // The sign-in screen already started this fetch; if it has landed, skip the spinner entirely.
  const [orgs, setOrgs] = useState<Organization[]>(() => peekOrganizations() ?? []);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(() => peekOrganizations()?.[0]?.id ?? '');
  const [loadingOrgs, setLoadingOrgs] = useState(() => !peekOrganizations());
  const [orgsError, setOrgsError] = useState(false);
  const [openOrgDdl, setOpenOrgDdl] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<'create' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadOrganizationsFast()
      .then((list) => {
        if (cancelled) return;
        setOrgs(list);
        setSelectedOrgId((prev) => prev || list[0]?.id || '');
        setOrgsError(false);
      })
      .catch(() => {
        if (!cancelled) setOrgsError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingOrgs(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const retryOrgs = () => {
    setLoadingOrgs(true);
    setOrgsError(false);
    loadOrganizationsFast()
      .then((list) => {
        setOrgs(list);
        setSelectedOrgId((prev) => prev || list[0]?.id || '');
      })
      .catch(() => setOrgsError(true))
      .finally(() => setLoadingOrgs(false));
  };

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && passwordMeetsRules(pw) && pw === confirm && !!selectedOrgId;

  const create = async () => {
    setError(null);
    setBusy('create');
    try {
      await api.signupStart(email.trim(), pw, selectedOrgId);
      await signIn(email, pw); // opens onboarding at the email-code step
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setError(null);
    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthShell
      compactLogo
      eyebrow="New employee"
      title="Create account"
      subtitle={selectedOrg ? `Join ${selectedOrg.name}` : 'Select your company to join your team'}
      below={<AuthLink lead="Already have an account?" action="Sign in" onPress={() => router.replace('/sign-in')} />}>
      {error && <Banner tone="danger">{error}</Banner>}

      {/* Organization DDL */}
      <View style={{ gap: 6 }}>
        <Text style={styles.fieldLabel}>Company</Text>
        <Pressable
          onPress={() => setOpenOrgDdl(!openOrgDdl)}
          style={[styles.ddlTrigger, openOrgDdl && styles.ddlTriggerActive]}>
          <Ionicons name="business-outline" size={18} color={openOrgDdl ? colors.brand : colors.textMuted} />
          <Text style={[styles.ddlTriggerText, !selectedOrg && { color: colors.textMuted }]} numberOfLines={1}>
            {loadingOrgs ? 'Loading companies…' : selectedOrg ? selectedOrg.name : 'Select your company'}
          </Text>
          {loadingOrgs ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : (
            <Ionicons name={openOrgDdl ? 'chevron-up' : 'chevron-down'} size={18} color={openOrgDdl ? colors.brand : colors.textMuted} />
          )}
        </Pressable>

        {openOrgDdl && (
          <View style={styles.ddlContainer}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
              {orgs.length === 0 ? (
                <View style={{ padding: spacing.md, alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted }}>
                    {orgsError ? 'Could not load companies. Check your connection.' : 'No companies found'}
                  </Text>
                  {orgsError && (
                    <Pressable onPress={retryOrgs} hitSlop={8}>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.brand }}>Retry</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                orgs.map((org, idx) => {
                  const active = org.id === selectedOrgId;
                  return (
                    <Pressable
                      key={org.id}
                      onPress={() => {
                        setSelectedOrgId(org.id);
                        setOpenOrgDdl(false);
                      }}
                      style={({ pressed }) => [
                        styles.ddlOption,
                        active && styles.ddlOptionActive,
                        pressed && styles.ddlOptionPressed,
                        idx < orgs.length - 1 && styles.ddlOptionBorder,
                      ]}>
                      <Ionicons name="business" size={18} color={active ? colors.brand : colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ddlOptionTitle, active && styles.ddlOptionTitleActive]}>{org.name}</Text>
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

      <TextField label="Work email" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="name@company.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <TextField
        label="Password"
        icon="lock-closed-outline"
        value={pw}
        onChangeText={setPw}
        placeholder="••••••••"
        secureToggle
        autoComplete="new-password"
        textContentType="newPassword"
      />
      {pw.length > 0 && <PasswordStrength password={pw} />}
      <TextField
        label="Confirm password"
        icon="lock-closed-outline"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="••••••••"
        secureToggle
        error={confirm && confirm !== pw ? 'Passwords do not match' : null}
      />
      <Button title="Create account" icon="arrow-forward" size="lg" disabled={!valid || !!busy} loading={busy === 'create'} onPress={create} />
      <OrDivider />
      <GoogleButton onPress={google} loading={busy === 'google'} label="Sign up with Google" />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  // Matches the label style of TextField (components/ui/forms.tsx).
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 0.1,
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
});
