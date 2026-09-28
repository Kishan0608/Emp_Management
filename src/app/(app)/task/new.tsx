import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, Card, ChoiceChips, DateField, PageHeader, Screen, SelectField, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { roleLabel } from '@/lib/format';
import type { ChecklistItem, TaskPriority, TaskVisibility } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export default function NewTask() {
  const { me, isBoss, isHR, isManager, isEmployee } = useMe();
  const toast = useToast();
  const people = useLoad(() => api.directory());

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string | null>(me.id);
  const [reviewer, setReviewer] = useState<string | null>(me.id);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [due, setDue] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<TaskVisibility>('private');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => (people.data ?? []).filter((p) => p.is_active), [people.data]);

  // Mirrors the server rule so people only see valid choices. The database still enforces it.
  const assignable = useMemo(
    () =>
      active.filter(
        (p) =>
          p.id === me.id ||
          isBoss ||
          (isHR && (p.role === 'employee' || p.role === 'hr')) ||
          (isManager && p.manager_id === me.id),
      ),
    [active, me.id, isBoss, isHR, isManager],
  );

  const personal = assignee === me.id && reviewer === me.id;

  const submit = async () => {
    setError(null);
    if (title.trim().length < 3) return setError('Give the task a clear title (3+ characters).');
    if (!assignee) return setError('Choose who the task is for.');
    setBusy(true);
    try {
      const id = await api.createTask({
        title: title.trim(),
        description,
        assignee,
        reviewer,
        priority,
        due,
        visibility,
        checklist,
      });
      toast(personal ? 'To-do added' : 'Task assigned');
      router.replace(`/task/${id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      keyboard
      header={<PageHeader title={isEmployee ? 'New personal to-do' : 'New task'} subtitle={isEmployee ? 'Only you can see personal to-dos' : undefined} />}
      footer={<Button title={personal ? 'Add to-do' : 'Assign task'} icon="send" size="lg" loading={busy} onPress={submit} />}>
      <View style={{ gap: spacing.lg }}>
        {error && <Banner tone="danger">{error}</Banner>}
        <Card style={{ gap: spacing.lg }}>
          <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Prepare monthly sales report" counter={160} />
          <TextField label="Description" value={description} onChangeText={setDescription} placeholder="What needs to be done, and what does 'done' look like?" multiline />
        </Card>

        {!isEmployee && (
          <Card style={{ gap: spacing.lg }}>
            <SelectField
              label="Assign to"
              icon="person-outline"
              value={assignee}
              onChange={setAssignee}
              options={assignable.map((p) => ({
                value: p.id,
                label: p.id === me.id ? `${p.full_name} (me)` : p.full_name,
                sublabel: [roleLabel[p.role], p.job_title].filter(Boolean).join(' · '),
              }))}
              hint={isManager ? 'Managers can assign to their own team.' : isHR ? 'HR can assign to employees and HR.' : undefined}
            />
            <SelectField
              label="Reviewer (approves the work)"
              icon="checkmark-done-outline"
              value={reviewer}
              onChange={setReviewer}
              options={active.map((p) => ({ value: p.id, label: p.id === me.id ? `${p.full_name} (me)` : p.full_name, sublabel: roleLabel[p.role] }))}
            />
          </Card>
        )}

        <Card style={{ gap: spacing.lg }}>
          <ChoiceChips
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'low', label: 'Low', tint: colors.textSecondary },
              { value: 'medium', label: 'Medium', tint: colors.info },
              { value: 'high', label: 'High', tint: colors.warning },
              { value: 'urgent', label: 'Urgent', tint: colors.danger, icon: 'flame' },
            ]}
          />
          <DateField label="Due date" value={due} onChange={setDue} hint="Optional" />
          {!personal && (
            <ChoiceChips
              label="Who can see it"
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: 'private', label: 'Private', icon: 'lock-closed-outline' },
                { value: 'team', label: 'Team', icon: 'people-outline' },
                { value: 'company', label: 'Company', icon: 'business-outline' },
              ]}
              hint="Private: assigner, assignee, reviewer and managers above them."
            />
          )}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Text style={styles.label}>Checklist</Text>
          {checklist.map((c, i) => (
            <View key={i} style={styles.checkRow}>
              <Ionicons name="ellipse-outline" size={18} color={colors.textMuted} />
              <Text style={styles.checkText}>{c.text}</Text>
              <Pressable onPress={() => setChecklist(checklist.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Remove item">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
          <View style={styles.addRow}>
            <TextInput
              value={newItem}
              onChangeText={setNewItem}
              placeholder="Add a step"
              placeholderTextColor={colors.textMuted}
              style={styles.addInput}
              onSubmitEditing={() => {
                if (newItem.trim()) setChecklist([...checklist, { text: newItem.trim(), done: false }]);
                setNewItem('');
              }}
              returnKeyType="done"
            />
            <Button
              title="Add"
              size="sm"
              variant="secondary"
              disabled={!newItem.trim()}
              onPress={() => {
                setChecklist([...checklist, { text: newItem.trim(), done: false }]);
                setNewItem('');
              }}
            />
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkText: { flex: 1, fontFamily: fonts.regular, fontSize: 14.5, color: colors.text },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.text,
  },
});
