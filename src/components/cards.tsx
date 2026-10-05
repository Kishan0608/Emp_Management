import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  audienceLabel,
  dueLabel,
  feedbackStatusLabel,
  feedbackStatusTone,
  feedbackTypeLabel,
  feedbackTypeTone,
  priorityLabel,
  priorityTone,
  resolveFeedbackDisplay,
  taskStatusLabel,
  taskStatusTone,
  timeAgo,
} from '@/lib/format';
import type { FeedbackItem, Task } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

import { Avatar, Badge, Card } from './ui';

const PRIORITY_BAR: Record<Task['priority'], string> = {
  low: '#CBD5E1',
  medium: colors.info,
  high: colors.warning,
  urgent: colors.danger,
};

export function TaskCard({ task, index = 0, showAssignee = true }: { task: Task; index?: number; showAssignee?: boolean }) {
  const due = dueLabel(task.due_date, task.status);
  const done = task.checklist?.filter((c) => c.done).length ?? 0;
  const total = task.checklist?.length ?? 0;
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 25).duration(240)}>
      <Card padded={false} onPress={() => router.push(`/task/${task.id}`)} style={styles.card}>
        <View style={[styles.priorityBar, { backgroundColor: PRIORITY_BAR[task.priority] }]} />
        <View style={styles.body}>
          <View style={styles.topRow}>
            <Badge label={taskStatusLabel[task.status]} tone={taskStatusTone[task.status]} />
            {task.is_personal ? (
              <Badge label="Personal" icon="person-outline" />
            ) : (
              <Badge label={priorityLabel[task.priority]} tone={priorityTone[task.priority]} icon="flag-outline" />
            )}
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {task.title}
          </Text>
          <View style={styles.metaRow}>
            {showAssignee && task.assignee && (
              <View style={styles.meta}>
                <Avatar name={task.assignee.full_name} id={task.assignee_id} size={20} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {task.assignee.full_name}
                </Text>
              </View>
            )}
            {due && (
              <View style={styles.meta}>
                <Ionicons name="time-outline" size={14} color={due.tone === 'danger' ? colors.danger : due.tone === 'warning' ? colors.warning : colors.textMuted} />
                <Text style={[styles.metaText, due.tone === 'danger' && { color: colors.danger }, due.tone === 'warning' && { color: colors.warning }]}>{due.text}</Text>
              </View>
            )}
            {total > 0 && (
              <View style={styles.meta}>
                <Ionicons name="checkbox-outline" size={14} color={colors.textMuted} />
                <Text style={styles.metaText}>
                  {done}/{total}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

const TYPE_ICON = { feedback: 'chatbubble-ellipses-outline', question: 'help-circle-outline', blocker: 'hand-left-outline' } as const;

export function FeedbackCard({
  item,
  index = 0,
  currentUserId,
}: {
  item: FeedbackItem;
  index?: number;
  currentUserId?: string;
}) {
  const { label, tone, icon, cleanTitle } = resolveFeedbackDisplay(item);
  const isMine = !!currentUserId && item.author_id === currentUserId;
  const replyCount = Array.isArray(item.replies) ? item.replies.length : 0;

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 25).duration(240)}>
      <Card onPress={() => router.push(`/feedback/${item.id}`)} style={{ gap: spacing.sm }}>
        <View style={styles.topRow}>
          <Badge label={label} tone={tone} icon={icon} />
          <Badge label={feedbackStatusLabel[item.status]} tone={feedbackStatusTone[item.status]} />
          {item.type === 'blocker' && item.escalation_level > 0 && (
            <Badge label={item.escalation_level === 1 ? 'Escalated · HR' : 'Escalated · Boss'} tone="danger" icon="trending-up" />
          )}
          {item.is_published && <Badge label="Q&A" tone="success" icon="globe-outline" />}
          {isMine && <Badge label="Mine" tone="brand" icon="person-circle-outline" />}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {cleanTitle}
        </Text>
        <Text style={type.small} numberOfLines={2}>
          {item.body}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.meta}>
            <Ionicons name={item.is_anonymous ? 'eye-off-outline' : 'person-outline'} size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>
              {item.is_anonymous
                ? isMine
                  ? 'Anonymous (You)'
                  : 'Anonymous'
                : isMine
                  ? 'You'
                  : (item.author?.full_name ?? 'Former employee')}
            </Text>
          </View>
          <View style={styles.meta}>
            <Ionicons name="paper-plane-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText}>{audienceLabel[item.audience]}</Text>
          </View>
          {replyCount > 0 && (
            <View style={styles.meta}>
              <Ionicons name="chatbubbles-outline" size={13} color={colors.brand} />
              <Text style={[styles.metaText, { color: colors.brand, fontFamily: fonts.semibold }]}>
                {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </Text>
            </View>
          )}
          <Text style={styles.metaText}>{timeAgo(item.created_at)}</Text>
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', overflow: 'hidden' },
  priorityBar: { width: 4 },
  body: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 21, color: colors.text },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 200 },
  metaText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textSecondary },
});

export const cardStyles = StyleSheet.create({ list: { gap: spacing.md }, pill: { borderRadius: radius.pill } });
