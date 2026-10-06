import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, EmptyState, IconTile, PageHeader, Screen, SectionTitle } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { PunchRow } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const CHUNK = 500;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^\S+@\S+\.\S+$/;

interface Parsed {
  rows: PunchRow[];
  problems: { line: number; reason: string }[];
  total: number;
}

/**
 * Reads a punching-machine export (CSV) with the columns:
 * email, date, clock_in, clock_out, break_start, break_end
 * Dates are YYYY-MM-DD and times HH:MM, in the company's local time. Column order does not matter.
 */
function parsePunchCsv(text: string): Parsed {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const rows: PunchRow[] = [];
  const problems: { line: number; reason: string }[] = [];
  if (lines.length === 0) return { rows, problems, total: 0 };

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const iEmail = col('email');
  const iDate = col('date', 'work_date');
  const iIn = col('clock_in', 'in');
  const iOut = col('clock_out', 'out');
  const iBs = col('break_start');
  const iBe = col('break_end');
  if (iEmail < 0 || iDate < 0 || iIn < 0) {
    return { rows, problems: [{ line: 1, reason: 'Header must include email, date and clock_in (clock_out, break_start and break_end are optional)' }], total: lines.length - 1 };
  }

  lines.slice(1).forEach((raw, idx) => {
    const line = idx + 2;
    const cells = raw.split(',').map((c) => c.trim());
    const get = (i: number) => (i >= 0 && cells[i] ? cells[i] : null);
    const email = get(iEmail);
    const date = get(iDate);
    const clockIn = get(iIn);
    const clockOut = get(iOut);
    const bs = get(iBs);
    const be = get(iBe);

    if (!email || !EMAIL.test(email)) return problems.push({ line, reason: 'Email is missing or not valid' });
    if (!date || !DATE.test(date)) return problems.push({ line, reason: 'Date must be YYYY-MM-DD' });
    if (!clockIn || !TIME.test(clockIn)) return problems.push({ line, reason: 'Clock-in must be HH:MM' });
    for (const [v, name] of [[clockOut, 'Clock-out'], [bs, 'Break start'], [be, 'Break end']] as const) {
      if (v && !TIME.test(v)) return problems.push({ line, reason: `${name} must be HH:MM` });
    }
    rows.push({
      email: email.toLowerCase(),
      work_date: date,
      clock_in: clockIn,
      clock_out: clockOut,
      break_start: bs,
      break_end: be,
    });
  });

  return { rows, problems, total: lines.length - 1 };
}

export default function AttendanceImport() {
  const { orgId = '', orgName = '' } = useLocalSearchParams<{ orgId?: string; orgName?: string }>();
  const { isBoss } = useMe();
  const toast = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; skipped: { email: string; reason: string }[] } | null>(null);

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const text = await (await fetch(asset.uri)).text();
      setFileName(asset.name);
      setResult(null);
      setParsed(parsePunchCsv(text));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const importAll = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setBusy(true);
    setResult(null);
    const total = { imported: 0, skipped: [] as { email: string; reason: string }[] };
    try {
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const r = await api.importPunchRecords(orgId, parsed.rows.slice(i, i + CHUNK));
        total.imported += r.imported;
        total.skipped.push(...r.skipped);
        setProgress(Math.min(parsed.rows.length, i + CHUNK));
      }
      setResult(total);
      toast(`Imported ${total.imported} day${total.imported === 1 ? '' : 's'}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const preview = useMemo(() => (parsed ? parsed.rows.slice(0, 5) : []), [parsed]);

  if (!isBoss) {
    return (
      <Screen header={<PageHeader title="Import punches" subtitle="Administration" />}>
        <EmptyState icon="lock-closed-outline" title="Access restricted" body="Only the Boss can import punching-machine data." />
      </Screen>
    );
  }

  return (
    <Screen header={<PageHeader title="Import punches" subtitle={orgName || 'Punching machine'} />}>
      <View style={{ gap: spacing.lg }}>
        <Card style={{ gap: spacing.md }}>
          <View style={styles.intro}>
            <IconTile icon="document-text-outline" color={colors.brand} bg={colors.brandSoft} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.bodyMedium}>Punching-machine export</Text>
              <Text style={type.small}>A CSV file with one row per employee per day.</Text>
            </View>
          </View>
          <Text style={styles.format} selectable>
            email, date, clock_in, clock_out, break_start, break_end{'\n'}
            asha@company.com, 2026-10-01, 10:04, 19:02, 13:30, 14:00
          </Text>
          <Text style={type.small}>Dates are YYYY-MM-DD and times are HH:MM in the company’s local time.</Text>
          <Button title={fileName ? 'Choose another file' : 'Choose CSV file'} icon="cloud-upload-outline" variant="outline" full onPress={pick} disabled={busy} />
        </Card>

        {parsed && (
          <>
            <SectionTitle title="Preview" action={fileName ?? undefined} />
            <Card style={{ gap: spacing.md }}>
              <View style={styles.counts}>
                <Count label="Rows" value={parsed.total} />
                <Count label="Ready" value={parsed.rows.length} tone={colors.success} />
                <Count label="Problems" value={parsed.problems.length} tone={parsed.problems.length ? colors.danger : undefined} />
              </View>

              {preview.length > 0 && (
                <View style={{ gap: spacing.sm }}>
                  {preview.map((r, i) => (
                    <View key={`${r.email}-${r.work_date}-${i}`} style={styles.previewRow}>
                      <Text style={[type.bodyMedium, { flex: 1, minWidth: 0 }]} numberOfLines={1}>
                        {r.email}
                      </Text>
                      <Text style={type.small}>
                        {r.work_date} · {r.clock_in}–{r.clock_out ?? '…'}
                      </Text>
                    </View>
                  ))}
                  {parsed.rows.length > preview.length && <Text style={type.small}>and {parsed.rows.length - preview.length} more</Text>}
                </View>
              )}

              {parsed.problems.length > 0 && (
                <Banner tone="danger" icon="alert-circle-outline">
                  {parsed.problems
                    .slice(0, 5)
                    .map((p) => `Line ${p.line}: ${p.reason}`)
                    .join('\n')}
                  {parsed.problems.length > 5 ? `\n…and ${parsed.problems.length - 5} more` : ''}
                </Banner>
              )}

              <Button
                title={busy ? `Importing… ${progress}/${parsed.rows.length}` : `Import ${parsed.rows.length} rows`}
                icon="checkmark"
                size="lg"
                loading={busy}
                disabled={busy || parsed.rows.length === 0}
                onPress={importAll}
              />
              <Text style={type.small}>Problem rows are skipped. Importing again updates the same days, so it is safe to re-run.</Text>
            </Card>
          </>
        )}

        {result && (
          <>
            <SectionTitle title="Result" />
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.resultTop}>
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                <Text style={type.bodyMedium}>
                  {result.imported} day{result.imported === 1 ? '' : 's'} imported
                </Text>
              </View>
              {result.skipped.length > 0 && (
                <Banner tone="warning" icon="warning-outline">
                  {`${result.skipped.length} row${result.skipped.length === 1 ? ' was' : 's were'} skipped:\n`}
                  {result.skipped.slice(0, 8).map((s) => `${s.email}: ${s.reason}`).join('\n')}
                </Banner>
              )}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View style={styles.count}>
      <Text style={[styles.countValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  format: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  counts: { flexDirection: 'row', justifyContent: 'space-around' },
  count: { alignItems: 'center', gap: 2, minWidth: 80 },
  countValue: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.text },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
