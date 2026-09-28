import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
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
import { caseStageLabel, caseStages, formatDate, formatDateTime, penaltyLabel } from '@/lib/format';
import type { CaseStage, Penalty } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

/** What should happen at each stage, and what document moves the case forward. */
const NEXT: Partial<Record<CaseStage, { next: CaseStage; action: string; guide: string; bossOnly?: boolean }>> = {
  preliminary_inquiry: {
    next: 'show_cause',
    action: 'Issue show-cause notice',
    guide: 'Gather independent evidence (records, named witnesses). An anonymous complaint is only a lead. The notice lists the allegations, never the complainants.',
  },
  show_cause: {
    next: 'employee_reply',
    action: 'Record that no reply was received',
    guide: 'The employee replies in writing in the app. If they do not reply within the reply period, record that here to move on.',
  },
  employee_reply: {
    next: 'domestic_inquiry',
    action: 'Record domestic inquiry',
    guide: 'Hold a fair hearing: the employee can present a defence and question witnesses. Record who attended and what was said.',
  },
  domestic_inquiry: { next: 'findings', action: 'Record findings', guide: 'State which allegations were proven, on what evidence. The employee is notified.' },
  findings: { next: 'penalty', action: 'Decide penalty', guide: 'Pick a penalty in proportion to the proven misconduct.', bossOnly: true },
  penalty: { next: 'written_order', action: 'Issue written order', guide: 'Issue the written order with reasons and an effective date. The employee is notified.', bossOnly: true },
  written_order: { next: 'closed', action: 'Close case', guide: 'Close the case once the order is carried out.', bossOnly: true },
};

export default function CaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, isBoss, isHR } = useMe();
  const toast = useToast();
  const kase = useLoad(() => api.case(id), [id]);
  const docs = useLoad(() => api.caseDocuments(id), [id]);
  const [advancing, setAdvancing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [penalty, setPenalty] = useState<Penalty | null>(null);
  const [busy, setBusy] = useState(false);
  const [noting, setNoting] = useState(false);
  const [replying, setReplying] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const k = kase.data;
  if (!k) {
    return <Screen header={<PageHeader title="Case" />}>{kase.error ? <Banner tone="danger">{kase.error}</Banner> : <ListSkeleton rows={3} />}</Screen>;
  }

  const isTarget = k.target_id === me.id;
  const staff = (isBoss || isHR) && !isTarget;
  const step = NEXT[k.stage];
  const canAdvance = staff && !k.closed_at && step && (!step.bossOnly || isBoss) && !(k.stage === 'written_order' && k.penalty === 'termination');
  const canTerminate = isBoss && k.stage === 'written_order' && k.penalty === 'termination' && !k.closed_at;
  const idx = caseStages.indexOf(k.stage);

  const reload = () => {
    kase.reload();
    docs.reload();
  };

  const advance = async () => {
    setBusy(true);
    try {
      await api.advanceCase(k.id, title, body, step?.next === 'penalty' ? (penalty ?? undefined) : undefined);
      toast('Case moved forward');
      setAdvancing(false);
      setTitle('');
      setBody('');
      setPenalty(null);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen refreshing={kase.refreshing} onRefresh={reload} header={<PageHeader title="Disciplinary case" subtitle={`Opened ${formatDate(k.opened_at)}`} />}>
        <View style={{ gap: spacing.lg }}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar name={k.target?.full_name} id={k.target_id} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={type.h2}>{isTarget ? 'Your case' : k.target?.full_name}</Text>
              <Text style={type.small}>{k.target?.job_title}</Text>
            </View>
            {k.closed_at ? <Badge label={k.terminated_at ? 'Terminated' : 'Closed'} /> : <Badge label={caseStageLabel[k.stage]} tone="warning" />}
          </Card>

          {isTarget && k.stage === 'show_cause' && (
            <Banner tone="warning" title="Your reply is required">
              <View style={{ gap: spacing.sm }}>
                <AppText variant="small">Read the notice below and submit your written explanation. You will also get a hearing before any decision.</AppText>
                <Button title="Write my reply" size="sm" icon="create-outline" onPress={() => setReplying(true)} />
              </View>
            </Banner>
          )}

          {/* stage tracker */}
          <Card style={{ gap: 0 }}>
            {caseStages.map((s, i) => {
              const done = i < idx || !!k.closed_at;
              const current = i === idx && !k.closed_at;
              return (
                <View key={s} style={styles.stageRow}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.stageDot, done && styles.stageDone, current && styles.stageCurrent]}>
                      {done ? <Ionicons name="checkmark" size={12} color={colors.white} /> : <Text style={[styles.stageNum, current && { color: colors.white }]}>{i + 1}</Text>}
                    </View>
                    {i < caseStages.length - 1 && <View style={[styles.stageLine, done && { backgroundColor: colors.brand }]} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: spacing.md }}>
                    <Text style={[type.bodyMedium, !done && !current && { color: colors.textMuted }]}>{caseStageLabel[s]}</Text>
                    {s === 'penalty' && k.penalty !== 'none' && (done || current) && <Text style={type.small}>{penaltyLabel[k.penalty]}</Text>}
                  </View>
                </View>
              );
            })}
          </Card>

          {staff && step && !k.closed_at && (
            <Card style={{ gap: spacing.md, borderColor: colors.brand + '40' }}>
              <Text style={type.caption}>Next step</Text>
              <Text style={type.h3}>{step.action}</Text>
              <AppText variant="small">{step.guide}</AppText>
              {canAdvance ? (
                <Button title={step.action} icon="arrow-forward" onPress={() => setAdvancing(true)} />
              ) : step.bossOnly && !isBoss ? (
                <Banner tone="info">Only the Boss can take this step.</Banner>
              ) : null}
              <Button title="Add internal note" variant="ghost" size="sm" icon="document-text-outline" onPress={() => setNoting(true)} />
            </Card>
          )}

          {canTerminate && (
            <Card style={{ gap: spacing.md, borderColor: colors.danger + '66', backgroundColor: '#FFF7F7' }}>
              <Text style={[type.h3, { color: colors.danger }]}>Terminate employment</Text>
              <AppText variant="small">
                The written order with a termination penalty is on record. Terminating deactivates the account and signs the person out everywhere. This cannot be undone in the app.
              </AppText>
              <Button title="Terminate" variant="danger" icon="warning" onPress={() => setTerminating(true)} />
            </Card>
          )}

          <SectionTitle title="Documents" />
          {(docs.data ?? []).length === 0 ? (
            <AppText variant="small">No documents yet.</AppText>
          ) : (
            (docs.data ?? []).map((d) => (
              <Card key={d.id} style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Badge label={d.doc_type.replace('_', ' ')} tone={d.doc_type === 'reply' ? 'info' : d.doc_type === 'note' ? 'neutral' : 'brand'} />
                  <Badge label={caseStageLabel[d.stage]} />
                </View>
                <Text style={type.h3}>{d.title}</Text>
                <Text style={[type.body, styles.doc]}>{d.body}</Text>
                <Text style={type.small}>
                  {d.author?.full_name ?? '—'} · {formatDateTime(d.created_at)}
                </Text>
              </Card>
            ))
          )}
        </View>
      </Screen>

      {/* advance */}
      <Sheet visible={advancing} onClose={() => setAdvancing(false)} title={step?.action ?? ''}>
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {step?.next === 'penalty' && (
            <ChoiceChips
              label="Penalty"
              value={penalty}
              onChange={setPenalty}
              options={(Object.keys(penaltyLabel) as Penalty[]).map((p) => ({ value: p, label: penaltyLabel[p], tint: p === 'termination' ? colors.danger : undefined }))}
            />
          )}
          <TextField label="Document title" value={title} onChangeText={setTitle} placeholder={step ? caseStageLabel[step.next] : ''} />
          <TextField label="Content" value={body} onChangeText={setBody} multiline counter={8000} placeholder="Write the full text of this stage's document." />
          <Button title="Save and move forward" loading={busy} disabled={body.trim().length < 10 || (step?.next === 'penalty' && !penalty)} onPress={advance} />
        </View>
      </Sheet>

      <PromptSheet
        visible={noting}
        onClose={() => setNoting(false)}
        title="Internal note"
        message="Visible to Boss and HR only, never to the employee."
        confirmLabel="Save note"
        onConfirm={async (text) => {
          try {
            await api.caseNote(k.id, 'Note', text);
            toast('Note added');
            setNoting(false);
            docs.reload();
          } catch (e) {
            toast(errorMessage(e), 'error');
          }
        }}
      />

      <PromptSheet
        visible={replying}
        onClose={() => setReplying(false)}
        title="Your written reply"
        message="Respond to each allegation in the notice. You may name witnesses or evidence."
        confirmLabel="Submit reply"
        minLength={20}
        onConfirm={async (text) => {
          try {
            await api.caseReply(k.id, text);
            toast('Reply submitted');
            setReplying(false);
            reload();
          } catch (e) {
            toast(errorMessage(e), 'error');
          }
        }}
      />

      <Sheet visible={terminating} onClose={() => setTerminating(false)} title="Confirm termination">
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Banner tone="danger">{`Type "${k.target?.full_name}" to confirm.`}</Banner>
          <TextField value={confirmName} onChangeText={setConfirmName} placeholder="Full name" autoCapitalize="words" />
          <Button
            title="Terminate employment"
            variant="danger"
            loading={busy}
            disabled={confirmName.trim().toLowerCase() !== (k.target?.full_name ?? '').toLowerCase()}
            onPress={async () => {
              setBusy(true);
              try {
                await api.terminate(k.id, confirmName);
                toast('Employment terminated and account deactivated');
                setTerminating(false);
                reload();
              } catch (e) {
                toast(errorMessage(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  stageRow: { flexDirection: 'row', gap: spacing.md },
  stageDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  stageCurrent: { backgroundColor: colors.warning, borderColor: colors.warning },
  stageNum: { fontFamily: fonts.bold, fontSize: 11, color: colors.textMuted },
  stageLine: { flex: 1, width: 2, minHeight: 14, backgroundColor: colors.border },
  doc: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
});
