import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AppText,
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  ChoiceChips,
  Divider,
  ListSkeleton,
  PageHeader,
  Screen,
  SectionTitle,
  SelectField,
  Sheet,
  SwitchRow,
  TextField,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { fieldLabel, formatDate, formatDateTime, formatINR, roleLabel, taskStatusLabel } from '@/lib/format';
import type { EmployeeProfile, Role, VisibilityField } from '@/lib/types';
import { useAuth, useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, spacing, type } from '@/theme/tokens';

export default function PersonProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, isBoss, isHR } = useMe();
  const { refresh: refreshMe } = useAuth();
  const toast = useToast();
  const profile = useLoad(() => api.profile(id), [id]);
  const people = useLoad(() => api.directory());
  const depts = useLoad(() => api.departments());
  const [editing, setEditing] = useState(false);
  const [editingRecord, setEditingRecord] = useState(false);
  const [editingContact, setEditingContact] = useState(false);

  const p = profile.data;
  if (!p) {
    return <Screen header={<PageHeader title="Profile" />}>{profile.error ? <Banner tone="danger">{profile.error}</Banner> : <ListSkeleton rows={3} />}</Screen>;
  }

  const isMe = p.id === me.id;
  const visible = new Set(p.visible_fields);
  const hidden = (Object.keys(fieldLabel) as VisibilityField[]).filter((f) => !visible.has(f));

  return (
    <>
      <Screen refreshing={profile.refreshing} onRefresh={profile.refresh} header={<PageHeader title={isMe ? 'My profile' : 'Profile'} />}>
        <View style={{ gap: spacing.lg }}>
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }}>
            <Avatar name={p.full_name} id={p.id} size={76} />
            <AppText variant="h1" style={{ textAlign: 'center' }}>
              {p.full_name}
            </AppText>
            <Text style={type.small}>{p.job_title ?? '—'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 4 }}>
              <Badge label={roleLabel[p.role]} tone="brand" />
              {p.department && <Badge label={p.department} />}
              {!p.is_active && <Badge label="Inactive" tone="danger" />}
            </View>
            {isBoss && !isMe && (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <Button title="Role & team" size="sm" variant="secondary" icon="create-outline" onPress={() => setEditing(true)} />
                <Button title="Records" size="sm" variant="outline" icon="document-text-outline" onPress={() => setEditingRecord(true)} />
              </View>
            )}
            {isHR && !isMe && !isBoss && p.role !== 'boss' && (
              <Button title="Edit records" size="sm" variant="outline" icon="document-text-outline" style={{ marginTop: spacing.md }} onPress={() => setEditingRecord(true)} />
            )}
            {isMe && (
              <Button title="Edit my details" size="sm" variant="secondary" icon="create-outline" style={{ marginTop: spacing.md }} onPress={() => setEditingContact(true)} />
            )}
          </Card>

          <Card padded={false}>
            <Info icon="mail-outline" label="Work email" value={p.email} />
            <Divider inset={52} />
            <Info icon="people-outline" label="Reports to" value={p.manager ?? '—'} />
            <Divider inset={52} />
            <Info icon="calendar-outline" label="Member since" value={formatDate(p.created_at)} />
          </Card>

          {visible.has('contact') && (
            <>
              <SectionTitle title="Contact" />
              <Card padded={false}>
                <Info icon="call-outline" label="Phone" value={p.phone ?? '—'} />
                <Divider inset={52} />
                <Info icon="at-outline" label="Personal email" value={p.personal_email ?? '—'} />
                <Divider inset={52} />
                <Info icon="home-outline" label="Address" value={p.address ?? '—'} />
                <Divider inset={52} />
                <Info icon="briefcase-outline" label="Joined" value={formatDate(p.joined_on)} />
              </Card>
            </>
          )}

          {(visible.has('salary') || visible.has('attendance') || visible.has('performance')) && (
            <>
              <SectionTitle title="Records" />
              <View style={styles.metrics}>
                {visible.has('salary') && <Metric label="Monthly salary" value={formatINR(p.salary_monthly)} icon="wallet-outline" />}
                {visible.has('attendance') && <Metric label="Attendance" value={p.attendance_pct != null ? `${p.attendance_pct}%` : '—'} icon="time-outline" />}
                {visible.has('performance') && <Metric label="Performance" value={p.performance_rating != null ? `${p.performance_rating} / 5` : '—'} icon="star-outline" />}
              </View>
            </>
          )}

          {visible.has('task_history') && p.task_stats && (
            <>
              <SectionTitle title="Task history" />
              <Card style={{ gap: spacing.lg }}>
                <View style={styles.metricsRow}>
                  <Stat label="Completed" value={p.task_stats.completed} color={colors.success} />
                  <Stat label="On time" value={p.task_stats.on_time} color={colors.task} />
                  <Stat label="Overdue" value={p.task_stats.overdue} color={colors.danger} />
                  <Stat label="Returned" value={p.task_stats.returned} color={colors.warning} />
                </View>
                {p.task_stats.completed > 0 && (
                  <Text style={type.small}>{Math.round((p.task_stats.on_time / p.task_stats.completed) * 100)}% of completed tasks were on time.</Text>
                )}
              </Card>
              {(p.timeline ?? []).length > 0 && (
                <Card padded={false}>
                  {(p.timeline ?? []).slice(0, 12).map((e, i) => (
                    <View key={`${e.task_id}-${e.created_at}`}>
                      {i > 0 && <Divider inset={16} />}
                      <View style={styles.tl}>
                        <View style={{ flex: 1 }}>
                          <Text style={type.bodyMedium} numberOfLines={1} onPress={() => router.push(`/task/${e.task_id}`)}>
                            {e.title}
                          </Text>
                          <Text style={type.small}>{formatDateTime(e.created_at)}</Text>
                        </View>
                        <Badge label={taskStatusLabel[e.to_status]} />
                      </View>
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}

          {!isMe && hidden.length > 0 && (
            <Card style={styles.hidden}>
              <Ionicons name="eye-off-outline" size={20} color={colors.textMuted} />
              <Text style={[type.small, { flex: 1 }]}>
                Hidden by the Boss&apos;s visibility settings: {hidden.map((f) => fieldLabel[f].toLowerCase()).join(', ')}.
              </Text>
            </Card>
          )}
        </View>
      </Screen>

      {editing && (
        <EditRoleSheet
          profile={p}
          people={(people.data ?? []).filter((x) => x.is_active && x.id !== p.id)}
          departments={depts.data ?? []}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            profile.reload();
            toast('Saved');
            refreshMe();
          }}
        />
      )}
      {editingRecord && (
        <EditRecordSheet
          id={p.id}
          initial={p}
          visible={visible}
          onClose={() => setEditingRecord(false)}
          onSaved={() => {
            setEditingRecord(false);
            profile.reload();
            toast('Records updated');
          }}
        />
      )}
      {editingContact && (
        <EditMyContactSheet
          initial={p}
          onClose={() => setEditingContact(false)}
          onSaved={() => {
            setEditingContact(false);
            profile.reload();
            toast('Your details are updated');
          }}
        />
      )}
    </>
  );
}

function EditRoleSheet({
  profile,
  people,
  departments,
  onClose,
  onSaved,
}: {
  profile: EmployeeProfile;
  people: { id: string; full_name: string; role: Role }[];
  departments: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<Role>(profile.role);
  const [dept, setDept] = useState<string | null>(profile.department_id);
  const [manager, setManager] = useState<string | null>(profile.manager_id);
  const [title, setTitle] = useState(profile.job_title ?? '');
  const [active, setActive] = useState(profile.is_active);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet visible onClose={onClose} title={`Edit ${profile.full_name.split(' ')[0]}`}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <ChoiceChips
          label="Role"
          value={role}
          onChange={setRole}
          options={(['employee', 'manager', 'hr', 'boss'] as Role[]).map((r) => ({ value: r, label: roleLabel[r] }))}
        />
        <SelectField label="Department" allowClear value={dept} onChange={setDept} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
        <SelectField
          label="Manager"
          allowClear
          value={manager}
          onChange={setManager}
          options={people.filter((x) => x.role !== 'employee').map((x) => ({ value: x.id, label: x.full_name, sublabel: roleLabel[x.role] }))}
        />
        <TextField label="Job title" value={title} onChangeText={setTitle} />
        <SwitchRow label="Account active" description="Inactive people cannot sign in or see anything." value={active} onChange={setActive} />
        <Button
          title="Save changes"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api.updateUser({ id: profile.id, role, department_id: dept, manager_id: manager, job_title: title, is_active: active, is_case_handler: false });
              onSaved();
            } catch (e) {
              toast(errorMessage(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Sheet>
  );
}

function EditRecordSheet({
  id,
  initial,
  visible,
  onClose,
  onSaved,
}: {
  id: string;
  initial: EmployeeProfile;
  visible: Set<VisibilityField>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [email, setEmail] = useState(initial.personal_email ?? '');
  const [address, setAddress] = useState(initial.address ?? '');
  const [salary, setSalary] = useState(initial.salary_monthly?.toString() ?? '');
  const [attendance, setAttendance] = useState(initial.attendance_pct?.toString() ?? '');
  const [perf, setPerf] = useState(initial.performance_rating?.toString() ?? '');
  const [joined, setJoined] = useState(initial.joined_on ?? '');
  const [busy, setBusy] = useState(false);
  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  return (
    <Sheet visible onClose={onClose} title="Employee records">
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <Banner tone="info">You can only edit the fields you are allowed to see. Every change is recorded in the audit log.</Banner>
        {visible.has('contact') && (
          <>
            <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <TextField label="Personal email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <TextField label="Address" value={address} onChangeText={setAddress} />
            <TextField label="Joined (YYYY-MM-DD)" value={joined} onChangeText={setJoined} />
          </>
        )}
        {visible.has('salary') && <TextField label="Salary / month (₹)" value={salary} onChangeText={setSalary} keyboardType="numeric" />}
        {visible.has('attendance') && <TextField label="Attendance %" value={attendance} onChangeText={setAttendance} keyboardType="numeric" />}
        {visible.has('performance') && <TextField label="Performance (0–5)" value={perf} onChangeText={setPerf} keyboardType="decimal-pad" />}
        <Button
          title="Save records"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api.setEmployeeDetails({
                id,
                phone: phone || null,
                personal_email: email || null,
                address: address || null,
                salary: num(salary),
                attendance: num(attendance),
                performance: num(perf),
                joined_on: joined || null,
              });
              onSaved();
            } catch (e) {
              toast(errorMessage(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Sheet>
  );
}

/** Self-service: the employee's own phone, personal email, address and joining date. Never salary/attendance/performance. */
function EditMyContactSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: { phone?: string | null; personal_email?: string | null; address?: string | null; joined_on?: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [email, setEmail] = useState(initial.personal_email ?? '');
  const [address, setAddress] = useState(initial.address ?? '');
  const [joined, setJoined] = useState(initial.joined_on ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <Sheet visible onClose={onClose} title="Edit my details">
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <Banner tone="info">Your phone, personal email, address and joining date. Salary, attendance and performance are managed by HR.</Banner>
        <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" />
        <TextField label="Personal email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" icon="at-outline" />
        <TextField label="Address" value={address} onChangeText={setAddress} icon="home-outline" multiline />
        <TextField label="Joined (YYYY-MM-DD)" value={joined} onChangeText={setJoined} icon="calendar-outline" placeholder="YYYY-MM-DD" />
        <Button
          title="Save my details"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api.updateMyContactDetails({
                phone: phone.trim() || null,
                personal_email: email.trim() || null,
                address: address.trim() || null,
                joined_on: joined.trim() || null,
              });
              onSaved();
            } catch (e) {
              toast(errorMessage(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Sheet>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={type.small}>{label}</Text>
        <Text style={type.bodyMedium} selectable>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <Card style={{ flex: 1, minWidth: 140, gap: 6 }}>
      <Ionicons name={icon} size={20} color={colors.brand} />
      <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.text }}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </Card>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 22, color }}>{value}</Text>
      <Text style={[type.small, { fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingHorizontal: spacing.lg },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricsRow: { flexDirection: 'row' },
  tl: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingHorizontal: spacing.lg },
  hidden: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceAlt },
});
