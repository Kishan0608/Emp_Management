import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, ChoiceChips, ListSkeleton, PageHeader, Screen, SectionTitle, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatDayLabel, shiftDay } from '@/lib/format';
import type { MyWorkDay, WorkAttachment } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;

/** Daily work log: what I worked on today (required when I have no open tasks), with hours and files. */
export default function WorkLog() {
  // Loaded once to know "today" in the company time zone; then the chosen day.
  const [date, setDate] = useState<string | null>(null);
  const day = useLoad(() => api.myWorkDay(date ?? undefined), [date]);
  const today = day.data?.today ?? null;
  const shown = date ?? today;

  const days = today
    ? [
        { value: today, label: 'Today' },
        { value: shiftDay(today, -1), label: 'Yesterday' },
        { value: shiftDay(today, -2), label: formatDayLabel(shiftDay(today, -2)) },
      ]
    : [];

  return (
    <Screen
      refreshing={day.refreshing}
      onRefresh={day.refresh}
      header={<PageHeader title="Daily work log" subtitle="What you worked on, for your manager and HR" />}>
      <View style={styles.wrap}>
        {days.length > 0 && <ChoiceChips options={days} value={shown} onChange={(d) => setDate(d)} />}
        {day.error && <Banner tone="danger">{day.error}</Banner>}
        {day.loading && !day.data ? (
          <ListSkeleton rows={3} />
        ) : day.data ? (
          // A new day (or a saved change) starts the form from what is stored.
          <DayLog key={`${day.data.work_date}-${day.data.log?.updated_at ?? 'new'}`} day={day.data} onSaved={day.reload} />
        ) : null}
      </View>
    </Screen>
  );
}

function DayLog({ day, onSaved }: { day: MyWorkDay; onSaved: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const log = day.log;
  const [summary, setSummary] = useState(log?.summary ?? '');
  const [hours, setHours] = useState(log?.hours != null ? String(log.hours) : '');
  const [files, setFiles] = useState<WorkAttachment[]>(log?.attachments ?? []);
  const [removedSaved, setRemovedSaved] = useState<string[]>([]);
  const [busy, setBusy] = useState<'save' | 'upload' | null>(null);

  const reviewed = !!log?.reviewed_at;
  const offDay = day.weekly_off || !!day.holiday || day.on_leave;
  const savedPaths = new Set((log?.attachments ?? []).map((a) => a.path));
  const changed =
    summary.trim() !== (log?.summary ?? '') ||
    hours.trim() !== (log?.hours != null ? String(log.hours) : '') ||
    JSON.stringify(files.map((f) => f.path)) !== JSON.stringify((log?.attachments ?? []).map((a) => a.path));

  const addFile = async () => {
    if (files.length >= MAX_FILES) return toast(`Up to ${MAX_FILES} files`, 'error');
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return;
    const f = res.assets[0];
    if ((f.size ?? 0) > MAX_BYTES) return toast('Files must be under 10 MB', 'error');
    setBusy('upload');
    try {
      const att = await api.uploadWorkLogFile(me.id, day.work_date, { uri: f.uri, name: f.name, mimeType: f.mimeType, size: f.size });
      setFiles((list) => [...list, att]);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const removeFile = (a: WorkAttachment) => {
    setFiles((list) => list.filter((x) => x.path !== a.path));
    // A file that was never saved is deleted now; a saved one only once the change is saved.
    if (savedPaths.has(a.path)) setRemovedSaved((r) => [...r, a.path]);
    else api.removeWorkLogFile(a.path).catch(() => {});
  };

  const openFile = async (a: WorkAttachment) => {
    try {
      await WebBrowser.openBrowserAsync(await api.workLogFileUrl(a.path));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const save = async () => {
    const text = summary.trim();
    if (text.length < 10) return toast('Describe your work in a few words (10+ characters)', 'error');
    const h = hours.trim() ? Number(hours.trim().replace(',', '.')) : null;
    if (h != null && (!Number.isFinite(h) || h < 0 || h > 24)) return toast('Hours must be between 0 and 24', 'error');
    setBusy('save');
    try {
      await api.submitWorkLog({ date: day.work_date, summary: text, hours: h, attachments: files });
      removedSaved.forEach((p) => api.removeWorkLogFile(p).catch(() => {}));
      toast(log ? 'Work log updated' : 'Work log added');
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <Status day={day} />

      {reviewed ? (
        <Card style={styles.card}>
          <Text style={styles.label}>What you worked on</Text>
          <Text style={styles.summary}>{log!.summary}</Text>
          {log!.hours != null && <Text style={styles.meta}>{log!.hours} hours</Text>}
          <Files files={files} onOpen={openFile} />
          <View style={styles.review}>
            <Ionicons name="checkmark-done-circle" size={18} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.reviewTitle}>
                Reviewed by {log!.reviewer ?? 'your manager'} · {formatDateTime(log!.reviewed_at!)}
              </Text>
              {log!.review_note && <Text style={styles.reviewNote}>“{log!.review_note}”</Text>}
            </View>
          </View>
        </Card>
      ) : (
        <>
          {!offDay && (
            <>
              <SectionTitle title={log ? 'Your work log' : 'What did you work on?'} />
              <Card style={styles.card}>
                <TextField
                  multiline
                  value={summary}
                  onChangeText={setSummary}
                  maxLength={4000}
                  counter={4000}
                  placeholder={'For example:\n• Visited 3 clients in Surat, took 2 orders\n• Prepared the monthly sales report\n• Next: follow up with ABC Traders'}
                  style={{ minHeight: 150 }}
                />
                <TextField
                  label="Hours worked (optional)"
                  value={hours}
                  onChangeText={(t) => setHours(t.replace(/[^\d.,]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 8"
                />
                <Text style={styles.label}>Photos and documents (optional)</Text>
                <Files files={files} onOpen={openFile} onRemove={removeFile} />
                <Button
                  title={busy === 'upload' ? 'Uploading…' : 'Add a photo or document'}
                  icon="attach"
                  variant="outline"
                  size="sm"
                  disabled={!!busy || files.length >= MAX_FILES}
                  loading={busy === 'upload'}
                  onPress={addFile}
                />
                <Text style={styles.hint}>PDF, Word, Excel, photos… up to 10 MB each, {MAX_FILES} files.</Text>
              </Card>
              <Button
                title={log ? 'Save changes' : 'Submit work log'}
                icon="checkmark"
                full
                disabled={!!busy || summary.trim().length < 10 || (!!log && !changed)}
                loading={busy === 'save'}
                onPress={save}
              />
              {log && <Text style={styles.hint}>Last saved {formatDateTime(log.updated_at)}. You can edit it until it is reviewed.</Text>}
            </>
          )}
        </>
      )}
    </View>
  );
}

function Status({ day }: { day: MyWorkDay }) {
  if (day.log?.reviewed_at) return null;
  if (day.holiday) return <Banner tone="info" icon="sparkles" title={`Holiday: ${day.holiday}`}>No work log needed.</Banner>;
  if (day.on_leave) return <Banner tone="info" icon="airplane" title="You are on leave">No work log needed.</Banner>;
  if (day.weekly_off) return <Banner tone="info" icon="cafe" title="Weekly off">No work log needed.</Banner>;
  if (day.log) return <Banner tone="success" icon="checkmark-circle" title="Work log added">Your manager and HR can see it.</Banner>;
  if (day.required)
    return (
      <Banner tone="warning" icon="document-text" title="Work log required">
        You have no open tasks. Write what you worked on so your manager and HR can see your day.
      </Banner>
    );
  return (
    <Banner tone="info" icon="document-text" title="Optional">
      {`You have ${day.open_tasks} open ${day.open_tasks === 1 ? 'task' : 'tasks'}. You can still add a note about your day.`}
    </Banner>
  );
}

function Files({ files, onOpen, onRemove }: { files: WorkAttachment[]; onOpen: (a: WorkAttachment) => void; onRemove?: (a: WorkAttachment) => void }) {
  if (files.length === 0) return onRemove ? null : <Text style={styles.meta}>No files</Text>;
  return (
    <View style={{ gap: spacing.xs }}>
      {files.map((a) => (
        <View key={a.path} style={styles.file}>
          <Ionicons name={a.type?.startsWith('image/') ? 'image-outline' : 'document-attach-outline'} size={18} color={colors.brand} />
          <Pressable onPress={() => onOpen(a)} style={{ flex: 1 }} accessibilityRole="link">
            <Text style={styles.fileName} numberOfLines={1}>
              {a.name}
            </Text>
            {a.size != null && <Text style={styles.fileSize}>{a.size < 1024 * 1024 ? `${Math.max(1, Math.round(a.size / 1024))} KB` : `${(a.size / 1024 / 1024).toFixed(1)} MB`}</Text>}
          </Pressable>
          {onRemove && (
            <Pressable onPress={() => onRemove(a)} hitSlop={8} accessibilityLabel={`Remove ${a.name}`}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.md },
  card: { gap: spacing.md },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary },
  summary: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  fileName: { fontFamily: fonts.medium, fontSize: 14, color: colors.brand },
  fileSize: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  review: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  reviewTitle: { fontFamily: fonts.semibold, fontSize: 13, color: colors.success },
  reviewNote: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});
