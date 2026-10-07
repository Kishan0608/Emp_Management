import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

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
import { DateInput } from '@/components/DateInput';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { dueLabel, formatDate, formatDateTime, priorityLabel, priorityTone, roleLabel, taskStatusLabel, taskStatusTone, toDateOnly, toneColors, type Tone } from '@/lib/format';
import type { ChecklistItem, Task, TaskEvent, TaskPriority, TaskStatus } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const FLOW: TaskStatus[] = ['assigned', 'accepted', 'submitted', 'approved'];
const STEP_LABEL: Partial<Record<TaskStatus, string>> = { assigned: 'Assigned', accepted: 'Accepted', submitted: 'Submitted', approved: 'Done' };
const STEP_HINT: Partial<Record<TaskStatus, string>> = { assigned: 'Task given', accepted: 'Working on it', submitted: 'Sent for review', approved: 'Completed' };

type Prompt = null | { to: TaskStatus; title: string; message: string; label: string; required: boolean; danger?: boolean; proof?: boolean };

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, isBoss } = useMe();
  const toast = useToast();
  const task = useLoad(() => api.task(id), [id]);
  const questions = useLoad(() => api.taskQuestions(id), [id]);
  const events = useLoad(() => api.taskEvents(id), [id]);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [proofLink, setProofLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [reassignBusy, setReassignBusy] = useState(false);
  const [showFlow, setShowFlow] = useState(false);

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
    events.reload();
  };

  const move = async (to: TaskStatus, note?: string, proof?: string, rating?: number) => {
    setBusy(to);
    try {
      await api.changeTaskStatus(id, to, note, proof, rating);
      toast(
        to === 'accepted'
          ? 'Task accepted'
          : to === 'submitted'
            ? 'Task submitted for review'
            : to === 'approved'
              ? `Task marked as done${rating ? ` · rated ${rating}★` : ''}`
              : to === 'closed'
                ? 'Task marked as done'
                : `Moved to ${taskStatusLabel[to].toLowerCase()}`,
      );
      setPrompt(null);
      setProofLink('');
      setShowRating(false);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const reassign = async (p: { assignee: string; title: string; description: string; priority: TaskPriority; due: string | null }) => {
    if (!t) return;
    setReassignBusy(true);
    try {
      await api.reassignTask({ id: t.id, assignee: p.assignee, title: p.title, description: p.description, priority: p.priority, due: p.due });
      toast('Task reassigned');
      setShowReassign(false);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setReassignBusy(false);
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
  const isCreator = t.created_by === me.id;
  const isReviewer = t.reviewer_id === me.id || isCreator || isBoss;
  const canEditChecklist = (isAssignee || isCreator) && !['submitted', 'approved', 'closed'].includes(t.status);
  const canApprove = !t.is_personal && isCreator && t.status === 'submitted';
  const canReassign = !t.is_personal && isCreator && t.status === 'returned';
  const rejectionNote =
    t.status === 'returned'
      ? [...(events.data ?? [])].reverse().find((e) => e.to_status === 'returned')?.note
      : null;
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
  const footerActions = canApprove
    ? [...actions, { label: 'Mark as done & rate', to: 'approved' as TaskStatus, icon: 'star' as const, kind: 'approve' as const }]
    : canReassign
      ? [...actions, { label: 'Reassign task', to: 'assigned' as TaskStatus, icon: 'repeat' as const, kind: 'reassign' as const }]
      : actions;

  return (
    <>
      <Screen
        refreshing={task.refreshing || questions.refreshing}
        onRefresh={reload}
        header={
          <PageHeader
            title={t.is_personal ? 'Personal to-do' : 'Task'}
            subtitle={`Created ${formatDate(t.created_at)}`}
            right={
              !t.is_personal ? (
                <Pressable
                  onPress={() => setShowFlow(true)}
                  accessibilityRole="button"
                  accessibilityLabel="View assignment flow"
                  style={({ pressed }) => [styles.flowBtn, pressed && { opacity: 0.8 }]}>
                  <Ionicons name="git-branch-outline" size={16} color={colors.brand} />
                  <Text style={styles.flowBtnText}>Flow</Text>
                </Pressable>
              ) : undefined
            }
          />
        }
        footer={
          footerActions.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {footerActions.map((a) => (
                <Button
                  key={a.label}
                  title={a.label}
                  icon={a.icon}
                  variant={a.variant}
                  style={{ flex: 1 }}
                  loading={busy === a.to}
                  onPress={() =>
                    a.kind === 'approve'
                      ? setShowRating(true)
                      : a.kind === 'reassign'
                        ? setShowReassign(true)
                        : a.prompt
                          ? setPrompt(a.prompt)
                          : move(a.to)
                  }
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
              {t.rating != null && <Badge label={`${t.rating}/5`} tone="warning" icon="star" />}
            </View>
            <AppText variant="h1">{t.title}</AppText>
            {t.description && <AppText variant="body" color={colors.textSecondary}>{t.description}</AppText>}
          </Card>

          {t.status === 'returned' && rejectionNote && (
            <Banner tone="danger">{`${t.assignee?.full_name ?? 'The assignee'} rejected this task: "${rejectionNote}"`}</Banner>
          )}

          {!t.is_personal && t.status !== 'returned' && <Stepper status={t.status} />}

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

          <SectionTitle
            title="Files"
            action={
              (isAssignee && !['submitted', 'approved', 'closed'].includes(t.status)) || isReviewer
                ? busy === 'upload'
                  ? 'Uploading…'
                  : 'Attach file'
                : undefined
            }
            onAction={attach}
          />
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

      <RatingSheet
        visible={showRating}
        onClose={() => setShowRating(false)}
        busy={busy === 'approved'}
        onConfirm={(stars, note) => move('approved', note, undefined, stars)}
      />

      <ReassignSheet visible={showReassign} onClose={() => setShowReassign(false)} task={t} busy={reassignBusy} onConfirm={reassign} />

      <FlowSheet visible={showFlow} onClose={() => setShowFlow(false)} task={t} events={events.data ?? []} />

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

/**
 * Team tasks go Assigned -> Accepted -> Submitted -> Done, with a Reject
 * branch off Assigned. Only the assignee moves the task through Accept /
 * Reject / Submit; after submitting (or rejecting), the assignee can't act
 * on the task any more. Only the person who assigned it ("Assigned by") can
 * then mark it Done (with a rating) or, if it was rejected, reassign it to
 * someone else — see `canApprove` / `canReassign` and `footerActions` in
 * TaskDetail. Personal to-dos skip straight to Done.
 */
function buildActions(t: Task, isAssignee: boolean) {
  type A = {
    label: string;
    to: TaskStatus;
    icon?: keyof typeof Ionicons.glyphMap;
    variant?: 'primary' | 'outline' | 'danger' | 'secondary';
    prompt?: Prompt;
    kind?: 'approve' | 'reassign';
  };
  const a: A[] = [];
  if (!isAssignee) return a;
  if (t.is_personal) {
    if (t.status !== 'closed') a.push({ label: 'Mark as done', to: 'closed', icon: 'checkmark-done' });
    return a;
  }
  if (t.status === 'assigned') {
    a.push({ label: 'Accept task', to: 'accepted', icon: 'hand-right-outline' });
    a.push({
      label: 'Reject',
      to: 'returned',
      icon: 'close-circle-outline',
      variant: 'danger',
      prompt: {
        to: 'returned',
        title: 'Reject this task?',
        message: 'Tell whoever assigned it why you\'re rejecting this task. They will be notified and can reassign it to someone else.',
        label: 'Reject task',
        required: true,
        danger: true,
      },
    });
  } else if (t.status === 'accepted')
    a.push({
      label: 'Submit work',
      to: 'submitted',
      icon: 'paper-plane-outline',
      prompt: { to: 'submitted', title: 'Submit this task for review?', message: 'Add a short note or a link to the result if you like. Files can be attached on the task. Once submitted, you can no longer edit this task.', label: 'Submit for review', required: false, proof: true },
    });
  // submitted / returned / approved / closed: the assignee has nothing left to do.
  return a;
}

/** Old in-between stages (in_progress, blocked, returned) count as Accepted; 'closed' is legacy Done. */
const stepOf = (s: TaskStatus): TaskStatus => {
  if (s === 'assigned') return 'assigned';
  if (s === 'submitted') return 'submitted';
  if (s === 'approved' || s === 'closed') return 'approved';
  return 'accepted';
};

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

/** Rate the assignee's work (1-5 stars) and mark the task done. Only shown to whoever assigned the task. */
function RatingSheet({
  visible,
  onClose,
  busy,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  busy: boolean;
  onConfirm: (stars: number, note?: string) => void;
}) {
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setStars(0);
        setNote('');
        onClose();
      }}
      title="Mark this task as done">
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.md }}>
        <AppText variant="small" color={colors.textSecondary}>
          Rate the work before closing the task. This also updates their performance rating.
        </AppText>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setStars(n)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>
              <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={34} color={colors.warning} />
            </Pressable>
          ))}
        </View>
        <TextField label="Note (optional)" multiline numberOfLines={3} style={{ minHeight: 70 }} value={note} onChangeText={setNote} placeholder="Any feedback on the work" />
        <Button title="Mark as done" icon="checkmark-done" variant="primary" disabled={stars === 0} loading={busy} onPress={() => onConfirm(stars, note.trim() || undefined)} />
      </View>
    </Sheet>
  );
}

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

/** Reassign a rejected task to someone else. Only shown to whoever assigned the task. */
function ReassignSheet({
  visible,
  onClose,
  task,
  busy,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  task: Task;
  busy: boolean;
  onConfirm: (p: { assignee: string; title: string; description: string; priority: TaskPriority; due: string | null }) => void;
}) {
  const { me, isBoss, isHR, isManager } = useMe();
  const { selectedOrgId } = useOrganization();
  const people = useLoad(() => api.taskAssignees(isBoss ? selectedOrgId : null), [selectedOrgId]);

  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [due, setDue] = useState<string | null>(task.due_date);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const assignable = useMemo(
    () =>
      (people.data ?? []).filter((p) => {
        if (!p.is_active || p.id === task.assignee_id) return false;
        if (isBoss) return true;
        if (isHR) return p.role === 'employee' || p.role === 'hr';
        if (isManager) return p.manager_id === me.id;
        return p.id === me.id;
      }),
    [people.data, me.id, isBoss, isHR, isManager, task.assignee_id],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignable;
    return assignable.filter((p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [assignable, search]);

  const selected = assignable.find((p) => p.id === assigneeId);
  const reset = () => {
    setAssigneeId(null);
    setTitle(task.title);
    setDescription(task.description ?? '');
    setPriority(task.priority);
    setDue(task.due_date);
  };

  return (
    <>
      <Sheet
        visible={visible}
        onClose={() => {
          reset();
          onClose();
        }}
        title="Reassign this task">
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.md }}>
          <AppText variant="small" color={colors.textSecondary}>
            {(task.assignee?.full_name ?? 'The previous assignee') + " rejected this task, so they can't be picked again. You can change anything about the task before sending it to someone new."}
          </AppText>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Reassign to *</Text>
            <Pressable onPress={() => setPickerOpen(true)} style={styles.reassignPicker}>
              {selected ? (
                <>
                  <Avatar name={selected.full_name} id={selected.id} size={30} />
                  <Text style={styles.reassignPickerText} numberOfLines={1}>
                    {selected.full_name}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="search-outline" size={18} color={colors.brand} />
                  <Text style={[styles.reassignPickerText, { color: colors.textMuted }]}>Search person by name…</Text>
                </>
              )}
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <TextField label="Task title *" value={title} onChangeText={setTitle} icon="document-text-outline" />
          <TextField label="Description" value={description} onChangeText={setDescription} multiline numberOfLines={3} style={{ minHeight: 70 }} />

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {PRIORITIES.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPriority(p)}
                  style={[styles.priorityChip, priority === p && { backgroundColor: colors.brandSoft, borderColor: colors.brand }]}>
                  <Text style={[styles.priorityChipText, priority === p && { color: colors.brand, fontFamily: fonts.bold }]}>{priorityLabel[p]}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <DateInput label="Due date" value={due} onChange={setDue} min={toDateOnly(new Date())} />

          <Button
            title="Reassign task"
            icon="repeat"
            variant="primary"
            loading={busy}
            disabled={!assigneeId || title.trim().length < 3}
            onPress={() =>
              assigneeId &&
              onConfirm({ assignee: assigneeId, title: title.trim(), description: description.trim(), priority, due })
            }
          />
        </View>
      </Sheet>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={styles.reassignSearchRow}>
            <View style={styles.reassignSearchBar}>
              <Ionicons name="search-outline" size={18} color={colors.brand} />
              <TextInput
                autoFocus
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name or email…"
                placeholderTextColor={colors.textMuted}
                style={styles.reassignSearchInput}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
            ListEmptyComponent={
              <AppText variant="small" color={colors.textSecondary} style={{ padding: spacing.lg, textAlign: 'center' }}>
                No matching person
              </AppText>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setAssigneeId(item.id);
                  setPickerOpen(false);
                  setSearch('');
                }}
                style={({ pressed }) => [styles.reassignRow, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <Avatar name={item.full_name} id={item.id} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyMedium}>{item.full_name}</Text>
                  <Text style={type.small}>{roleLabel[item.role]}{item.job_title ? ` · ${item.job_title}` : ''}</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

/** Icon, tone and label for one step in the flow timeline. */
function flowStepMeta(e: TaskEvent): { icon: keyof typeof Ionicons.glyphMap; tone: Tone; label: string } {
  if (e.to_status === 'assigned') {
    return e.from_status === 'returned'
      ? { icon: 'repeat', tone: 'brand', label: 'Reassigned' }
      : { icon: 'person-add-outline', tone: 'neutral', label: 'Task created' };
  }
  if (e.to_status === 'accepted') return { icon: 'checkmark-circle-outline', tone: 'info', label: 'Accepted' };
  if (e.to_status === 'returned') return { icon: 'close-circle-outline', tone: 'danger', label: 'Rejected' };
  if (e.to_status === 'submitted') return { icon: 'paper-plane-outline', tone: 'warning', label: 'Submitted for review' };
  if (e.to_status === 'approved' || e.to_status === 'closed') return { icon: 'checkmark-done', tone: 'success', label: 'Marked done' };
  return { icon: 'ellipse-outline', tone: 'neutral', label: taskStatusLabel[e.to_status] };
}

/** x of the node "port" (the badge circle's centre) inside the flow canvas. */
const FLOW_PORT_X = 19;
const FLOW_BADGE = 38;

/**
 * Who the task has been through, step by step: created & assigned, then every
 * accept / reject / submit / reassign / done — each a node card, connected by
 * a drawn wire like a workflow builder (n8n-style), coloured by what happened.
 * Replaces the static "Assigned to / Assigned by" card; opened from the
 * "Flow" button in the header.
 */
function FlowSheet({ visible, onClose, task: t, events }: { visible: boolean; onClose: () => void; task: Task; events: TaskEvent[] }) {
  // Each node's badge-centre Y, measured relative to the canvas, so the SVG wires land exactly on the ports.
  const [portY, setPortY] = useState<number[]>([]);
  const setPort = (i: number, y: number) => setPortY((prev) => { const next = [...prev]; next[i] = y + FLOW_BADGE / 2; return next; });

  return (
    <Sheet visible={visible} onClose={onClose} title="Assignment flow">
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.md }}>
        <Card padded={false}>
          <Person label="Currently assigned to" name={t.assignee?.full_name} id={t.assignee_id} />
          <Divider inset={64} />
          <Person label="Assigned by" name={t.creator?.full_name} id={t.created_by} />
          {t.reviewer_id && t.reviewer_id !== t.created_by && (
            <>
              <Divider inset={64} />
              <Person label="Reviewer" name={t.reviewer?.full_name} id={t.reviewer_id} />
            </>
          )}
        </Card>

        {events.length === 0 ? (
          <AppText variant="small" color={colors.textSecondary}>No activity yet.</AppText>
        ) : (
          <View style={{ position: 'relative' }}>
            {/* Wires, drawn behind the node cards, one wavy bezier per gap between ports. */}
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
              {events.slice(0, -1).map((e, i) => {
                const y0 = portY[i];
                const y1 = portY[i + 1];
                if (y0 == null || y1 == null) return null;
                const wiggle = i % 2 === 0 ? 16 : -16;
                const toneColor = toneColors[flowStepMeta(events[i + 1]).tone].fg;
                return (
                  <Path
                    key={e.id}
                    d={`M ${FLOW_PORT_X} ${y0} C ${FLOW_PORT_X + wiggle} ${y0 + (y1 - y0) / 3}, ${FLOW_PORT_X - wiggle} ${y0 + (2 * (y1 - y0)) / 3}, ${FLOW_PORT_X} ${y1}`}
                    stroke={toneColor}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    fill="none"
                    opacity={0.55}
                  />
                );
              })}
              {portY.map((y, i) => (y == null ? null : <Circle key={i} cx={FLOW_PORT_X} cy={y} r={3} fill={toneColors[flowStepMeta(events[i]).tone].fg} />))}
            </Svg>

            {events.map((e, i) => {
              const meta = flowStepMeta(e);
              const toneColor = toneColors[meta.tone];
              return (
                <View key={e.id} style={styles.flowRow} onLayout={(ev) => setPort(i, ev.nativeEvent.layout.y)}>
                  <View style={styles.flowRail}>
                    <View style={[styles.flowBadge, { backgroundColor: toneColor.bg, borderColor: toneColor.fg }]}>
                      <Ionicons name={meta.icon} size={17} color={toneColor.fg} />
                    </View>
                  </View>
                  <View style={[styles.flowNode, { borderColor: toneColor.fg, backgroundColor: toneColor.bg }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                      <Text style={[type.bodyMedium, { color: toneColor.fg }]}>{meta.label}</Text>
                      <Text style={[type.small, { fontSize: 11 }]}>{formatDateTime(e.created_at)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Avatar name={e.actor?.full_name} id={e.actor_id ?? undefined} size={18} />
                      <Text style={type.small}>{e.actor?.full_name ?? 'Someone'}</Text>
                      {e.to_status === 'approved' && t.rating != null && (
                        <Badge label={`${t.rating}/5`} tone="warning" icon="star" />
                      )}
                    </View>
                    {e.note && (
                      <View style={styles.flowNote}>
                        <Text style={[type.body, { fontSize: 13, color: colors.textSecondary }]}>{`"${e.note}"`}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Sheet>
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
  fieldLabel: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text },
  reassignPicker: {
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
  reassignPickerText: { flex: 1, fontFamily: fonts.medium, fontSize: 14.5, color: colors.text },
  priorityChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  priorityChipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  reassignSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  reassignSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  reassignSearchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  reassignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  flowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandTint,
  },
  flowBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brand },
  flowRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.lg },
  flowRail: { width: FLOW_BADGE, alignItems: 'center' },
  flowBadge: {
    width: FLOW_BADGE,
    height: FLOW_BADGE,
    borderRadius: FLOW_BADGE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowNode: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  flowNote: {
    marginTop: 6,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
});
