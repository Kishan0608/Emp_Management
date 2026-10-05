import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppText,
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  ListSkeleton,
  PageHeader,
  PromptSheet,
  Screen,
  SectionTitle,
  TextField,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { dueLabel, formatDate, formatDateTime, priorityLabel, priorityTone, taskStatusLabel, taskStatusTone } from '@/lib/format';
import type { ChecklistItem, Task, TaskStatus } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, spacing, type } from '@/theme/tokens';

const FLOW: TaskStatus[] = ['assigned', 'accepted', 'closed'];
const STEP_LABEL: Partial<Record<TaskStatus, string>> = { assigned: 'Assigned', accepted: 'Accepted', closed: 'Done' };
const STEP_HINT: Partial<Record<TaskStatus, string>> = { assigned: 'Task given', accepted: 'Working on it', closed: 'Completed' };

type Prompt = null | { to: TaskStatus; title: string; message: string; label: string; required: boolean; danger?: boolean; proof?: boolean };

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, isBoss } = useMe();
  const toast = useToast();
  const task = useLoad(() => api.task(id), [id]);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [proofLink, setProofLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const t = task.data;
  const reload = () => {
    task.reload();
  };

  const move = async (to: TaskStatus, note?: string, proof?: string) => {
    setBusy(to);
    try {
      await api.changeTaskStatus(id, to, note, proof);
      toast(to === 'accepted' ? 'Task accepted' : to === 'closed' ? 'Task marked as done' : `Moved to ${taskStatusLabel[to].toLowerCase()}`);
      setPrompt(null);
      setProofLink('');
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!t) {
    return (
      <Screen header={<PageHeader title="Task" />}>
        {task.error ? <Banner tone="danger">{task.error}</Banner> : <ListSkeleton rows={3} />}
      </Screen>
    );
  }

  const isAssignee = t.assignee_id === me.id;
  const isReviewer = t.reviewer_id === me.id || t.created_by === me.id || isBoss;
  const canEditChecklist = (isAssignee || t.created_by === me.id) && !['approved', 'closed'].includes(t.status);
  const due = dueLabel(t.due_date, t.status);

  const toggle = async (i: number) => {
    const next: ChecklistItem[] = t.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c));
    task.setData({ ...t, checklist: next });
    try {
      await api.updateChecklist(t.id, next);
    } catch (e) {
      toast(errorMessage(e), 'error');
      task.reload();
    }
  };

  const attach = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return;
    const f = res.assets[0];
    if ((f.size ?? 0) > 10 * 1024 * 1024) return toast('Files must be under 10 MB', 'error');
    setBusy('upload');
    try {
      await api.uploadTaskFile(t.id, { uri: f.uri, name: f.name, mimeType: f.mimeType });
      toast('File attached');
      task.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const openFile = async (path: string) => {
    try {
      await WebBrowser.openBrowserAsync(await api.fileUrl(path));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const actions = buildActions(t, isAssignee);

  return (
    <>
      <Screen
        refreshing={task.refreshing}
        onRefresh={reload}
        header={<PageHeader title={t.is_personal ? 'Personal to-do' : 'Task'} subtitle={`Created ${formatDate(t.created_at)}`} />}
        footer={
          actions.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {actions.map((a) => (
                <Button
                  key={a.label}
                  title={a.label}
                  icon={a.icon}
                  variant={a.variant}
                  style={{ flex: 1 }}
                  loading={busy === a.to}
                  onPress={() => (a.prompt ? setPrompt(a.prompt) : move(a.to))}
                />
              ))}
            </View>
          ) : undefined
        }>
        <View style={{ gap: spacing.lg }}>
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Badge label={taskStatusLabel[t.status]} tone={taskStatusTone[t.status]} />
              {!t.is_personal && <Badge label={`${priorityLabel[t.priority]} priority`} tone={priorityTone[t.priority]} icon="flag-outline" />}
              {due && <Badge label={due.text} tone={due.tone} icon="time-outline" />}
            </View>
            <AppText variant="h1">{t.title}</AppText>
            {t.description && <AppText variant="body" color={colors.textSecondary}>{t.description}</AppText>}
          </Card>

          {!t.is_personal && <Stepper status={t.status} />}

          {!t.is_personal && (
            <Card padded={false}>
              <Person label="Assigned to" name={t.assignee?.full_name} id={t.assignee_id} />
              <Divider inset={64} />
              <Person label="Assigned by" name={t.creator?.full_name} id={t.created_by} />
              {t.reviewer_id && t.reviewer_id !== t.created_by && (
                <>
                  <Divider inset={64} />
                  <Person label="Reviewer" name={t.reviewer?.full_name} id={t.reviewer_id} />
                </>
              )}
            </Card>
          )}

          {t.checklist.length > 0 && (
            <>
              <SectionTitle title={`Checklist · ${t.checklist.filter((c) => c.done).length}/${t.checklist.length}`} />
              <Card padded={false}>
                {t.checklist.map((c, i) => (
                  <Pressable
                    key={i}
                    disabled={!canEditChecklist}
                    onPress={() => toggle(i)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: c.done }}
                    style={({ pressed }) => [styles.check, pressed && { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name={c.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={c.done ? colors.success : colors.textMuted} />
                    <Text style={[type.body, { flex: 1 }, c.done && { textDecorationLine: 'line-through', color: colors.textMuted }]}>{c.text}</Text>
                  </Pressable>
                ))}
              </Card>
            </>
          )}

          <SectionTitle title="Files" action={isAssignee || isReviewer ? (busy === 'upload' ? 'Uploading…' : 'Attach file') : undefined} onAction={attach} />
          {t.attachments.length === 0 ? (
            <AppText variant="small">No files yet. Attach photos or documents of the work here.</AppText>
          ) : (
            <Card padded={false}>
              {t.attachments.map((a, i) => (
                <View key={a.path}>
                  {i > 0 && <Divider inset={56} />}
                  <Pressable onPress={() => openFile(a.path)} style={({ pressed }) => [styles.file, pressed && { backgroundColor: colors.surfaceAlt }]}>
                    <View style={styles.fileIcon}>
                      <Ionicons name="document-attach-outline" size={20} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyMedium} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text style={type.small}>{formatDateTime(a.at)}</Text>
                    </View>
                    <Ionicons name="open-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </Card>
          )}

        </View>
      </Screen>

      {prompt && (
        <PromptSheet
          visible
          onClose={() => setPrompt(null)}
          title={prompt.title}
          message={prompt.message}
          confirmLabel={prompt.label}
          danger={prompt.danger}
          required={prompt.required && !(prompt.proof && proofLink.trim())}
          placeholder={prompt.proof ? 'What did you do? Where is the result?' : 'Write here'}
          onConfirm={(text) => move(prompt.to, text, prompt.proof ? proofLink.trim() : undefined)}>
          {prompt.proof && (
            <>
              <TextField label="Link (optional)" icon="link-outline" value={proofLink} onChangeText={setProofLink} placeholder="https://" autoCapitalize="none" keyboardType="url" />
              {t.attachments.length > 0 && <Banner tone="success">{`${t.attachments.length} file(s) attached to this task.`}</Banner>}
            </>
          )}
        </PromptSheet>
      )}
    </>
  );
}

/** Tasks go Assigned -> Accepted -> Done. Only the assignee moves them forward. */
function buildActions(t: Task, isAssignee: boolean) {
  type A = { label: string; to: TaskStatus; icon?: keyof typeof Ionicons.glyphMap; variant?: 'primary' | 'outline' | 'danger' | 'secondary'; prompt?: Prompt };
  const a: A[] = [];
  if (!isAssignee || t.status === 'closed') return a;
  if (t.is_personal) {
    a.push({ label: 'Mark as done', to: 'closed', icon: 'checkmark-done' });
    return a;
  }
  if (t.status === 'assigned') a.push({ label: 'Accept task', to: 'accepted', icon: 'hand-right-outline' });
  else
    a.push({
      label: 'Mark as done',
      to: 'closed',
      icon: 'checkmark-done',
      prompt: { to: 'closed', title: 'Mark this task as done?', message: 'Add a short note or a link to the result if you like. Files can be attached on the task.', label: 'Mark as done', required: false, proof: true },
    });
  return a;
}

/** Old in-between stages count as Accepted; approved counts as Done. */
const stepOf = (s: TaskStatus): TaskStatus => (s === 'assigned' ? 'assigned' : s === 'closed' || s === 'approved' ? 'closed' : 'accepted');

function Stepper({ status }: { status: TaskStatus }) {
  const idx = FLOW.indexOf(stepOf(status));
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.stepper}>
        {FLOW.map((s, i) => {
          const done = i <= idx;
          const current = i === idx;
          return (
            <View key={s} style={styles.step}>
              {i < FLOW.length - 1 && <View style={[styles.stepLine, i < idx && { backgroundColor: colors.brand }]} />}
              <View style={[styles.stepDot, done && { backgroundColor: i === FLOW.length - 1 ? colors.success : colors.brand, borderColor: i === FLOW.length - 1 ? colors.success : colors.brand }, current && styles.stepDotCurrent]}>
                {done ? <Ionicons name="checkmark" size={15} color={colors.white} /> : <Text style={styles.stepNum}>{i + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, current && { color: colors.text, fontFamily: fonts.bold }]}>{STEP_LABEL[s]}</Text>
              <Text style={styles.stepHint}>{STEP_HINT[s]}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function Person({ label, name, id }: { label: string; name?: string | null; id: string }) {
  return (
    <View style={styles.person}>
      <Avatar name={name} id={id} size={36} />
      <View>
        <Text style={type.small}>{label}</Text>
        <Text style={type.bodyMedium}>{name ?? '—'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  file: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingHorizontal: spacing.lg },
  fileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center' },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  stepDotCurrent: { transform: [{ scale: 1.08 }] },
  stepNum: { fontFamily: fonts.bold, fontSize: 13, color: colors.textMuted },
  stepLine: { position: 'absolute', top: 14, left: '50%', width: '100%', height: 3, borderRadius: 2, backgroundColor: colors.border },
  stepLabel: { marginTop: 8, fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  stepHint: { marginTop: 1, fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingHorizontal: spacing.lg },
});
