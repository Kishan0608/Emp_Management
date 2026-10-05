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
  Sheet,
  TextField,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { dueLabel, formatDate, formatDateTime, priorityLabel, priorityTone, taskStatusLabel, taskStatusTone } from '@/lib/format';
import type { ChecklistItem, Task, TaskQuestion, TaskStatus } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const FLOW: TaskStatus[] = ['assigned', 'accepted', 'closed'];
const STEP_LABEL: Partial<Record<TaskStatus, string>> = { assigned: 'Assigned', accepted: 'Accepted', closed: 'Done' };
const STEP_HINT: Partial<Record<TaskStatus, string>> = { assigned: 'Task given', accepted: 'Working on it', closed: 'Completed' };

type Prompt = null | { to: TaskStatus; title: string; message: string; label: string; required: boolean; danger?: boolean; proof?: boolean };

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, isBoss } = useMe();
  const toast = useToast();
  const task = useLoad(() => api.task(id), [id]);
  const questions = useLoad(() => api.taskQuestions(id), [id]);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [proofLink, setProofLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Question sheet & composer state
  const [showQuestionSheet, setShowQuestionSheet] = useState(false);
  const [qTitle, setQTitle] = useState('');
  const [qBody, setQBody] = useState('');
  const [asking, setAsking] = useState(false);

  // Question reply state
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const t = task.data;
  const reload = () => {
    task.reload();
    questions.reload();
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

  const questionRecipientName = isAssignee
    ? (t.creator?.full_name ?? t.reviewer?.full_name ?? 'Task Assigner')
    : (t.assignee?.full_name ?? 'Assigned Person');
  const questionRecipientRole = isAssignee ? 'Task Assigner' : 'Assigned Person';

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

  const handleAskQuestion = async () => {
    const titleTrim = qTitle.trim();
    const bodyTrim = qBody.trim();
    if (!titleTrim) return toast('Please enter a question subject', 'error');
    if (!bodyTrim) return toast('Please enter question details', 'error');

    setAsking(true);
    try {
      await api.askTaskQuestion(id, titleTrim, bodyTrim);
      toast(`Question sent to ${questionRecipientName}`);
      setQTitle('');
      setQBody('');
      setShowQuestionSheet(false);
      questions.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setAsking(false);
    }
  };

  const handleSendReply = async (questionId: string) => {
    const text = replyText.trim();
    if (!text) return toast('Please write a reply', 'error');

    setReplying(true);
    try {
      await api.replyTaskQuestion(questionId, text);
      toast('Reply sent');
      setReplyText('');
      setActiveReplyId(null);
      questions.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setReplying(false);
    }
  };

  const actions = buildActions(t, isAssignee);
  const qList = questions.data ?? [];

  return (
    <>
      <Screen
        refreshing={task.refreshing || questions.refreshing}
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

          {/* Dedicated Questions & Replies Section */}
          <SectionTitle
            title={`Questions${qList.length > 0 ? ` · ${qList.length}` : ''}`}
            action="+ Question"
            onAction={() => setShowQuestionSheet(true)}
          />

          {questions.loading && !questions.data ? (
            <ListSkeleton rows={2} />
          ) : qList.length === 0 ? (
            <Card style={styles.emptyQuestionsCard}>
              <View style={styles.emptyQuestionsIcon}>
                <Ionicons name="chatbubbles-outline" size={26} color={colors.brand} />
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <AppText variant="h3" style={{ textAlign: 'center' }}>No questions yet</AppText>
                <AppText variant="small" color={colors.textSecondary} style={{ textAlign: 'center', maxWidth: 300 }}>
                  {isAssignee
                    ? `Have a doubt or need clarification? Ask ${t.creator?.full_name ?? 'your manager'} directly here.`
                    : `Have a question for ${t.assignee?.full_name ?? 'the assignee'}? Ask here and they will be notified immediately.`}
                </AppText>
              </View>
              <Button
                title="+ Question"
                icon="help-circle-outline"
                variant="secondary"
                size="sm"
                onPress={() => setShowQuestionSheet(true)}
              />
            </Card>
          ) : (
            <View style={{ gap: spacing.md }}>
              {qList.map((q) => {
                const isAuthor = q.author_id === me.id;
                const isRecipient = q.recipient_id === me.id;
                const isReplyingThis = activeReplyId === q.id;

                return (
                  <Card key={q.id} style={{ gap: spacing.sm, padding: spacing.lg }}>
                    {/* Author & status badge */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                        <Avatar name={q.author_name} id={q.author_id} size={34} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={type.bodyMedium} numberOfLines={1}>
                              {q.author_name ?? 'Team member'}
                            </Text>
                            {isAuthor && <Badge label="You" tone="neutral" />}
                          </View>
                          <Text style={type.small}>{formatDateTime(q.created_at)}</Text>
                        </View>
                      </View>

                      <Badge
                        label={q.status === 'answered' ? 'Answered' : 'Open'}
                        tone={q.status === 'answered' ? 'success' : 'warning'}
                        icon={q.status === 'answered' ? 'checkmark-circle-outline' : 'time-outline'}
                      />
                    </View>

                    {/* Question Subject & Details */}
                    <View style={{ marginTop: 2, gap: 4 }}>
                      <Text style={[type.h2, { fontSize: 16, color: colors.text }]}>{q.title}</Text>
                      <Text style={[type.body, { color: colors.textSecondary, lineHeight: 21 }]}>{q.body}</Text>
                    </View>

                    {/* Target Recipient Info */}
                    <View style={styles.recipientPill}>
                      <Ionicons name="paper-plane-outline" size={13} color={colors.brand} />
                      <Text style={type.small}>
                        Sent to:{' '}
                        <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>
                          {isRecipient ? 'You' : (q.recipient_name ?? 'Assigned member')}
                        </Text>
                      </Text>
                    </View>

                    {/* Replies Thread */}
                    {q.replies && q.replies.length > 0 && (
                      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                        <Divider />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.textSecondary} />
                          <Text style={[type.small, { fontFamily: fonts.semibold, color: colors.textSecondary }]}>
                            Replies ({q.replies.length})
                          </Text>
                        </View>
                        {q.replies.map((r) => {
                          const isMeReply = r.author_id === me.id;
                          return (
                            <View key={r.id} style={styles.replyBubble}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 4 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Avatar name={r.author_name} id={r.author_id} size={22} />
                                  <Text style={[type.small, { fontFamily: fonts.semibold, color: colors.text }]}>
                                    {r.author_name}
                                  </Text>
                                  {isMeReply && <Badge label="You" tone="neutral" />}
                                </View>
                                <Text style={[type.small, { fontSize: 11, color: colors.textMuted }]}>
                                  {formatDateTime(r.created_at)}
                                </Text>
                              </View>
                              <Text style={[type.body, { fontSize: 13, color: colors.text, lineHeight: 19 }]}>{r.body}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Inline Reply input / toggle */}
                    <View style={{ marginTop: spacing.xs }}>
                      {!isReplyingThis ? (
                        <Pressable
                          onPress={() => {
                            setActiveReplyId(q.id);
                            setReplyText('');
                          }}
                          style={({ pressed }) => [styles.replyToggleBtn, pressed && { opacity: 0.75 }]}>
                          <Ionicons name="arrow-undo-outline" size={14} color={colors.brand} />
                          <Text style={[type.small, { color: colors.brand, fontFamily: fonts.semibold }]}>
                            {q.replies && q.replies.length > 0 ? 'Reply to thread' : 'Reply to question'}
                          </Text>
                        </Pressable>
                      ) : (
                        <View style={styles.replyInputContainer}>
                          <TextField
                            placeholder={`Reply to ${q.author_name?.split(' ')[0] ?? 'this question'}...`}
                            value={replyText}
                            onChangeText={setReplyText}
                            multiline
                            numberOfLines={3}
                            style={{ minHeight: 70 }}
                            autoFocus
                          />
                          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xs }}>
                            <Button
                              title="Cancel"
                              variant="ghost"
                              size="sm"
                              disabled={replying}
                              onPress={() => {
                                setActiveReplyId(null);
                                setReplyText('');
                              }}
                            />
                            <Button
                              title="Send Reply"
                              icon="send"
                              size="sm"
                              variant="primary"
                              loading={replying}
                              disabled={!replyText.trim()}
                              onPress={() => handleSendReply(q.id)}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  </Card>
                );
              })}
            </View>
          )}

        </View>
      </Screen>

      {/* Ask Question Sheet */}
      <Sheet visible={showQuestionSheet} onClose={() => setShowQuestionSheet(false)} title="Ask a Question">
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.md }}>
          <View style={styles.askRecipientNotice}>
            <View style={styles.askRecipientIcon}>
              <Ionicons name="paper-plane" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.small, { color: colors.textSecondary }]}>This question will be sent and notified to:</Text>
              <Text style={[type.bodyMedium, { color: colors.brand, fontFamily: fonts.bold }]}>
                {questionRecipientName}
                <Text style={{ fontFamily: fonts.regular, color: colors.textMuted, fontSize: 12 }}>
                  {` · ${questionRecipientRole}`}
                </Text>
              </Text>
            </View>
          </View>

          <TextField
            label="Question Subject"
            placeholder="e.g. Clarification on requirement, asset format..."
            value={qTitle}
            onChangeText={setQTitle}
            icon="help-circle-outline"
          />

          <TextField
            label="Details / Description"
            placeholder="Provide specific details so they can answer promptly..."
            value={qBody}
            onChangeText={setQBody}
            multiline
            numberOfLines={4}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
            <Button
              title="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              disabled={asking}
              onPress={() => setShowQuestionSheet(false)}
            />
            <Button
              title="Submit Question"
              icon="paper-plane"
              variant="primary"
              style={{ flex: 1 }}
              loading={asking}
              disabled={!qTitle.trim() || !qBody.trim()}
              onPress={handleAskQuestion}
            />
          </View>
        </View>
      </Sheet>

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
  emptyQuestionsCard: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  emptyQuestionsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  replyBubble: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  replyToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  replyInputContainer: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  askRecipientNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  askRecipientIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
