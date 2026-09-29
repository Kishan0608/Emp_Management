import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const FLOW: TaskStatus[] = ['assigned', 'accepted', 'in_progress', 'submitted', 'approved', 'closed'];

const EVENT_ICON: Record<TaskStatus, keyof typeof Ionicons.glyphMap> = {
  assigned: 'add-circle',
  accepted: 'hand-right',
  in_progress: 'play-circle',
  blocked: 'hand-left',
  submitted: 'cloud-upload',
  approved: 'checkmark-circle',
  returned: 'arrow-undo-circle',
  closed: 'lock-closed',
};

type Prompt = null | { to: TaskStatus; title: string; message: string; label: string; required: boolean; danger?: boolean; proof?: boolean };

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, isBoss } = useMe();
  const toast = useToast();
  const task = useLoad(() => api.task(id), [id]);
  const events = useLoad(() => api.taskEvents(id), [id]);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [proofLink, setProofLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const t = task.data;
  const reload = () => {
    task.reload();
    events.reload();
  };

  const move = async (to: TaskStatus, note?: string, proof?: string) => {
    setBusy(to);
    try {
      await api.changeTaskStatus(id, to, note, proof);
      toast(`Moved to ${taskStatusLabel[to].toLowerCase()}`);
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

  const actions = buildActions(t, isAssignee, isReviewer);

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
            <AppText variant="small">No files yet. Attach proof of work before submitting.</AppText>
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

          <SectionTitle title="Timeline" />
          <Card>
            {events.loading ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              (events.data ?? []).map((e, i, arr) => (
                <View key={e.id} style={styles.event}>
                  <View style={{ alignItems: 'center' }}>
                    <Ionicons name={EVENT_ICON[e.to_status]} size={22} color={toneColor(e.to_status)} />
                    {i < arr.length - 1 && <View style={styles.eventLine} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: spacing.lg, gap: 2 }}>
                    <Text style={type.bodyMedium}>
                      {taskStatusLabel[e.to_status]}
                      <Text style={type.small}> · {e.actor?.full_name ?? 'System'}</Text>
                    </Text>
                    <Text style={type.small}>{formatDateTime(e.created_at)}</Text>
                    {e.note && <Text style={[type.body, styles.note]}>{e.note}</Text>}
                    {e.proof_url && (
                      <Pressable onPress={() => WebBrowser.openBrowserAsync(e.proof_url!)}>
                        <Text style={[type.smallMedium, { color: colors.brand }]} numberOfLines={1}>
                          🔗 {e.proof_url}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </Card>
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

function buildActions(t: Task, isAssignee: boolean, isReviewer: boolean) {
  type A = { label: string; to: TaskStatus; icon?: keyof typeof Ionicons.glyphMap; variant?: 'primary' | 'outline' | 'danger' | 'secondary'; prompt?: Prompt };
  const a: A[] = [];
  const block: A = {
    label: 'Blocked',
    to: 'blocked',
    icon: 'hand-left-outline',
    variant: 'outline',
    prompt: { to: 'blocked', title: 'What is stopping you?', message: 'A blocker is sent to your manager now, to HR after the set hours, and to the Boss if still unanswered.', label: 'Raise blocker', required: true, danger: true },
  };
  const submit: A = {
    label: 'Submit',
    to: 'submitted',
    icon: 'cloud-upload-outline',
    prompt: { to: 'submitted', title: 'Submit for review', message: 'Add proof of work: a comment, a link, or attach files first.', label: 'Submit for review', required: true, proof: true },
  };

  if (t.is_personal) {
    if (t.status !== 'closed' && isAssignee) a.push({ label: 'Mark done', to: 'closed', icon: 'checkmark' });
    return a;
  }
  if (isAssignee) {
    if (t.status === 'assigned') a.push({ label: 'Accept', to: 'accepted', icon: 'hand-right-outline' });
    if (t.status === 'accepted') a.push({ label: 'Start', to: 'in_progress', icon: 'play' }, block);
    if (t.status === 'in_progress') a.push(block, submit);
    if (t.status === 'blocked' || t.status === 'returned') a.push({ label: 'Resume work', to: 'in_progress', icon: 'play' });
  }
  if (isReviewer && t.status === 'submitted') {
    a.push(
      {
        label: 'Return',
        to: 'returned',
        icon: 'arrow-undo',
        variant: 'outline',
        prompt: { to: 'returned', title: 'Return with a reason', message: 'Tell the assignee what to change.', label: 'Return task', required: true, danger: true },
      },
      { label: 'Approve', to: 'approved', icon: 'checkmark-done' },
    );
  }
  if (isReviewer && t.status === 'approved') a.push({ label: 'Close task', to: 'closed', icon: 'lock-closed-outline', variant: 'secondary' });
  return a;
}

function toneColor(s: TaskStatus) {
  if (s === 'approved') return colors.success;
  if (s === 'blocked' || s === 'returned') return colors.danger;
  if (s === 'submitted') return colors.warning;
  if (s === 'closed') return colors.textMuted;
  return colors.brand;
}

function Stepper({ status }: { status: TaskStatus }) {
  const effective = status === 'blocked' ? 'in_progress' : status === 'returned' ? 'in_progress' : status;
  const idx = FLOW.indexOf(effective);
  return (
    <Card style={{ gap: spacing.md }}>
      {(status === 'blocked' || status === 'returned') && (
        <Banner tone="danger" title={status === 'blocked' ? 'Work is blocked' : 'Returned for changes'}>
          {status === 'blocked' ? 'A blocker was raised in Feedback and will escalate if unanswered.' : 'See the reviewer’s note in the timeline.'}
        </Banner>
      )}
      <View style={styles.stepper}>
        {FLOW.map((s, i) => {
          const done = i <= idx;
          return (
            <View key={s} style={styles.step}>
              <View style={[styles.stepDot, done && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
                {done && <Ionicons name="checkmark" size={12} color={colors.white} />}
              </View>
              {i < FLOW.length - 1 && <View style={[styles.stepLine, i < idx && { backgroundColor: colors.brand }]} />}
              <Text style={[styles.stepLabel, i === idx && { color: colors.brand, fontFamily: fonts.semibold }]} numberOfLines={2}>
                {taskStatusLabel[s]}
              </Text>
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
  event: { flexDirection: 'row', gap: spacing.md },
  eventLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  note: { marginTop: 6, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, fontSize: 14 },
  stepper: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center' },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  stepLine: { position: 'absolute', top: 10, left: '50%', width: '100%', height: 2, backgroundColor: colors.border },
  stepLabel: { marginTop: 6, fontFamily: fonts.medium, fontSize: 10.5, color: colors.textMuted, textAlign: 'center' },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingHorizontal: spacing.lg },
});
