import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { AppText, Avatar, Badge, Banner, Button, Card, ListSkeleton, PageHeader, Screen, SectionTitle, SwitchRow, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import {
  audienceLabel,
  feedbackStatusLabel,
  feedbackStatusTone,
  feedbackTypeLabel,
  feedbackTypeTone,
  formatDateTime,
  resolveFeedbackDisplay,
  roleLabel,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { FeedbackStatus } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

export default function FeedbackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, isBoss, isHR } = useMe();
  const toast = useToast();
  const item = useLoad(() => api.feedbackItem(id), [id]);
  const replies = useLoad(() => api.feedbackReplies(id), [id]);
  const [text, setText] = useState('');
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => {
    item.reload();
    replies.reload();
  };

  // Live updates: new replies and status/publish changes stream in via Supabase
  // Realtime, so the thread stays current without pull-to-refresh. Must run
  // before the loading guard below so hook order stays stable across renders.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`feedback:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feedback_replies', filter: `feedback_id=eq.${id}` }, () => {
        replies.reload();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'feedback_items', filter: `id=eq.${id}` }, () => {
        item.reload();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `item`/`replies` are fresh functions each render; only `id` should re-open the channel.
  }, [id]);

  const f = item.data;
  if (!f) {
    return <Screen header={<PageHeader title="Feedback" />}>{item.error ? <Banner tone="danger">{item.error}</Banner> : <ListSkeleton rows={3} />}</Screen>;
  }

  const { label, tone, icon, cleanTitle } = resolveFeedbackDisplay(f);

  const isAuthor = f.author_id === me.id;
  const canRespond = isBoss || isHR || (me.role === 'manager' && f.recipient_manager_id === me.id && ['manager', 'all'].includes(f.audience));
  const canReply = canRespond || isAuthor;

  const setStatus = async (s: FeedbackStatus) => {
    setBusy(s);
    try {
      await api.setFeedbackStatus(f.id, s);
      toast(`Marked ${feedbackStatusLabel[s].toLowerCase()}`);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy('reply');
    try {
      await api.replyFeedback(f.id, text.trim(), publish);
      setText('');
      setPublish(false);
      toast(publish ? 'Answered and published to Q&A' : 'Reply sent');
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      keyboard
      refreshing={item.refreshing}
      onRefresh={reload}
      header={<PageHeader title={label} subtitle={formatDateTime(f.created_at)} />}
      footer={
        canReply && f.status !== 'resolved' ? (
          <View style={{ gap: spacing.sm }}>
            {canRespond && f.type === 'question' && !isAuthor && (isBoss || isHR) && (
              <SwitchRow label="Publish answer to Q&A board" description="Everyone can then read the question and answer (without the author's name)." value={publish} onChange={setPublish} />
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <TextField value={text} onChangeText={setText} placeholder={canRespond && !isAuthor ? 'Write an answer' : 'Add a follow-up'} />
              </View>
              <Button title="Send" icon="send" disabled={text.trim().length < 2} loading={busy === 'reply'} onPress={send} />
            </View>
          </View>
        ) : undefined
      }>
      <View style={{ gap: spacing.lg }}>
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge label={label} tone={tone} icon={icon} />
            <Badge label={feedbackStatusLabel[f.status]} tone={feedbackStatusTone[f.status]} />
            <Badge label={`To ${audienceLabel[f.audience]}`} icon="paper-plane-outline" />
            {f.is_published && <Badge label="On Q&A board" tone="success" icon="globe-outline" />}
            {f.type === 'blocker' && f.escalation_level > 0 && <Badge label={f.escalation_level === 1 ? 'Escalated to HR' : 'Escalated to Boss'} tone="danger" icon="trending-up" />}
          </View>
          <AppText variant="h1">{cleanTitle}</AppText>
          <AppText variant="body" color={colors.textSecondary}>
            {f.body.replace(/\n\n📎 Attachment:\s*.+$/, '').trim()}
          </AppText>
          {f.body.match(/📎 Attachment:\s*(.+)$/) && (
            <View style={styles.attachmentBadge}>
              <Ionicons name="document-attach-outline" size={17} color={colors.brand} />
              <Text style={styles.attachmentBadgeText}>
                {f.body.match(/📎 Attachment:\s*(.+)$/)?.[1]}
              </Text>
            </View>
          )}
          <View style={styles.author}>
            {f.is_anonymous ? (
              <Badge label="Anonymous" icon="eye-off-outline" />
            ) : (
              <>
                <Avatar name={f.author?.full_name} id={f.author_id ?? undefined} size={28} />
                <Text style={type.smallMedium}>{f.author?.full_name ?? 'Former employee'}</Text>
              </>
            )}
          </View>
          {f.task_id && <Button title="Open blocked task" size="sm" variant="outline" icon="checkbox-outline" onPress={() => router.push(`/task/${f.task_id}`)} />}
        </Card>

        {canRespond && f.status !== 'resolved' && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {f.status === 'open' && <Button title="Acknowledge" icon="eye-outline" variant="outline" style={{ flex: 1 }} loading={busy === 'acknowledged'} onPress={() => setStatus('acknowledged')} />}
            <Button title="Mark resolved" icon="checkmark-done" variant="secondary" style={{ flex: 1 }} loading={busy === 'resolved'} onPress={() => setStatus('resolved')} />
          </View>
        )}
        {isAuthor && !canRespond && f.status !== 'resolved' && (
          <Button title="My issue is resolved" icon="checkmark-done" variant="secondary" loading={busy === 'resolved'} onPress={() => setStatus('resolved')} />
        )}
        {(isBoss || isHR) && f.type === 'question' && ['answered', 'resolved'].includes(f.status) && (
          <Button
            title={f.is_published ? 'Remove from Q&A board' : 'Publish to Q&A board'}
            icon="globe-outline"
            variant="outline"
            onPress={async () => {
              try {
                await api.setFeedbackPublished(f.id, !f.is_published);
                toast(f.is_published ? 'Removed from Q&A' : 'Published to Q&A');
                item.reload();
              } catch (e) {
                toast(errorMessage(e), 'error');
              }
            }}
          />
        )}

        {(() => {
          const replyList = f.replies && f.replies.length > 0 ? f.replies : replies.data ?? [];
          return (
            <>
              <SectionTitle title={`Conversation · ${replyList.length}`} />
              {replyList.length === 0 ? (
                <AppText variant="small">No replies yet.</AppText>
              ) : (
                replyList.map((r, i) => {
                  const mine = r.responder_id === me.id;
                  return (
                    <Animated.View key={r.id} entering={FadeInUp.delay(i * 40)} style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
                      {!mine && <Avatar name={r.responder?.full_name} id={r.responder_id ?? undefined} size={30} />}
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                        <Text style={[styles.bubbleName, mine && { color: 'rgba(255,255,255,0.85)' }]}>
                          {mine ? 'You' : r.responder?.full_name ?? 'Former employee'}
                          {r.responder && !mine ? ` · ${roleLabel[r.responder.role]}` : ''}
                        </Text>
                        <Text style={[styles.bubbleText, mine && { color: colors.white }]}>{r.body}</Text>
                        <Text style={[styles.bubbleTime, mine && { color: 'rgba(255,255,255,0.7)' }]}>{formatDateTime(r.created_at)}</Text>
                      </View>
                    </Animated.View>
                  );
                })
              )}
            </>
          );
        })()}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  bubble: { maxWidth: '82%', padding: spacing.md, borderRadius: radius.lg, gap: 4 },
  bubbleMine: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleName: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textSecondary },
  bubbleText: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 21, color: colors.text },
  bubbleTime: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, alignSelf: 'flex-end' },
  attachmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  attachmentBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text,
  },
});
