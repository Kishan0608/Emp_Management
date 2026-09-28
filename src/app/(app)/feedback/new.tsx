import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { AppText, Banner, Button, Card, ChoiceChips, PageHeader, Screen, SelectField, SwitchRow, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import type { FeedbackAudience, FeedbackType } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, spacing } from '@/theme/tokens';

const CONDUCT_WORDS = /\b(harass|bully|bullied|abus|rude|shout|yell|insult|threat|misbehav|inappropriate|discriminat|humiliat)/i;

export default function NewFeedback() {
  const { me, manager, settings } = useMe();
  const toast = useToast();
  const people = useLoad(() => api.directory());
  const myTasks = useLoad(() => api.tasks('mine', me.id));

  const [kind, setKind] = useState<FeedbackType>('question');
  const [audience, setAudience] = useState<FeedbackAudience>(manager ? 'manager' : 'hr');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamSize = useMemo(
    () => (people.data ?? []).filter((p) => p.is_active && p.department_id === me.department_id).length,
    [people.data, me.department_id],
  );

  // Nudge: if this reads like a complaint about a specific person, suggest the Complaint module.
  const mentionsPerson = useMemo(() => {
    const text = `${title} ${body}`.toLowerCase();
    return (people.data ?? []).some((p) => p.id !== me.id && p.full_name.length > 3 && text.includes(p.full_name.split(' ')[0].toLowerCase()));
  }, [people.data, title, body, me.id]);
  const conductNudge = kind !== 'blocker' && CONDUCT_WORDS.test(`${title} ${body}`) && (mentionsPerson || /\b(he|she|they|my manager|colleague)\b/i.test(body));

  const submit = async () => {
    setError(null);
    if (title.trim().length < 3) return setError('Add a short title.');
    if (body.trim().length < 5) return setError('Please add a little more detail.');
    setBusy(true);
    try {
      const id = await api.submitFeedback({
        type: kind,
        audience,
        title: title.trim(),
        body: body.trim(),
        anonymous: kind !== 'blocker' && anonymous,
        taskId: kind === 'blocker' ? taskId : null,
      });
      toast(kind === 'blocker' ? 'Blocker raised. Your manager has been notified.' : 'Sent');
      if (anonymous && kind !== 'blocker') router.back();
      else router.replace(`/feedback/${id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const activeTasks = (myTasks.data ?? []).filter((t) => ['accepted', 'in_progress'].includes(t.status) && !t.is_personal);

  return (
    <Screen
      keyboard
      header={<PageHeader title="New post" subtitle="Feedback, a work question, or a blocker" />}
      footer={<Button title={kind === 'blocker' ? 'Raise blocker' : 'Send'} icon="paper-plane" size="lg" loading={busy} onPress={submit} />}>
      <View style={{ gap: spacing.lg }}>
        {error && <Banner tone="danger">{error}</Banner>}
        <Card style={{ gap: spacing.lg }}>
          <ChoiceChips
            label="Type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'question', label: 'Work question', icon: 'help-circle-outline', tint: colors.brand },
              { value: 'feedback', label: 'Feedback', icon: 'chatbubble-ellipses-outline', tint: colors.feedback },
              { value: 'blocker', label: 'Blocker', icon: 'hand-left-outline', tint: colors.danger },
            ]}
          />
          {kind === 'blocker' && (
            <Banner tone="warning" title="Work is stopped">
              {`Your manager is notified now. If nobody answers, it escalates to HR after ${settings.blocker_hr_hours} hours and to the Boss after ${settings.blocker_boss_hours} hours.`}
            </Banner>
          )}
          <ChoiceChips
            label="Send to"
            value={audience}
            onChange={setAudience}
            options={[
              ...(manager ? [{ value: 'manager' as const, label: `Manager (${manager.split(' ')[0]})` }] : []),
              { value: 'hr' as const, label: 'HR' },
              { value: 'boss' as const, label: 'Boss' },
              ...(manager ? [{ value: 'all' as const, label: 'Manager & HR' }] : []),
            ]}
          />
        </Card>

        <Card style={{ gap: spacing.lg }}>
          <TextField label="Title" value={title} onChangeText={setTitle} placeholder={kind === 'question' ? 'e.g. How do I apply for WFH?' : 'Short summary'} counter={160} />
          <TextField label="Details" value={body} onChangeText={setBody} placeholder="Explain clearly. Include what you already tried." multiline counter={4000} />
          {conductNudge && (
            <Banner tone="warning" title="Is this about someone's conduct?">
              <View style={{ gap: spacing.sm }}>
                <AppText variant="small">
                  Feedback does not count toward any complaint record. If this is about a person&apos;s behaviour, use a Complaint instead. It is anonymous by design.
                </AppText>
                <Button title="File a complaint instead" size="sm" variant="outline" icon="shield-outline" onPress={() => router.replace('/complaint/new')} />
              </View>
            </Banner>
          )}
          {kind === 'blocker' && activeTasks.length > 0 && (
            <SelectField
              label="Blocked task (optional)"
              icon="checkbox-outline"
              allowClear
              value={taskId}
              onChange={setTaskId}
              options={activeTasks.map((t) => ({ value: t.id, label: t.title }))}
              hint="Tip: you can also raise a blocker from the task itself."
            />
          )}
        </Card>

        {kind !== 'blocker' && (
          <Card>
            <SwitchRow
              label="Send anonymously"
              description="Your name is not stored. Nobody can see who sent it, but you won't be able to follow up."
              value={anonymous}
              onChange={setAnonymous}
            />
            {anonymous && teamSize > 0 && teamSize < settings.min_group_size && (
              <Banner tone="warning">{`Your team has only ${teamSize} people, so readers may be able to guess who wrote this from the details.`}</Banner>
            )}
          </Card>
        )}
      </View>
    </Screen>
  );
}
