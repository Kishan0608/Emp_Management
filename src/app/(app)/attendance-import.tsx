import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, EmptyState, IconTile, PageHeader, Screen, SectionTitle } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { parsePunchFile, type PunchImportResult } from '@/lib/punchImport';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const CHUNK = 500;

export default function AttendanceImport() {
  const { orgId = '', orgName = '' } = useLocalSearchParams<{ orgId?: string; orgName?: string }>();
  const { isBoss } = useMe();
  const toast = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<PunchImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; skipped: { email: string; reason: string }[] } | null>(null);

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const bytes = await (await fetch(asset.uri)).arrayBuffer();
      setFileName(asset.name);
      setResult(null);
      setParsed(parsePunchFile(bytes, asset.name));
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
              <Text style={type.small}>Excel (.xlsx/.xls) or CSV — one row per punch, or one row per day. Column order doesn’t matter.</Text>
            </View>
          </View>
          <Text style={type.small}>
            Each person needs an Employee code set first (open their profile → Edit records) matching the machine’s ID column —
            or the file can carry their email instead.
          </Text>
          <Button title={fileName ? 'Choose another file' : 'Choose file'} icon="cloud-upload-outline" variant="outline" full onPress={pick} disabled={busy} />
        </Card>

        {parsed && (
          <>
            <SectionTitle title="What was detected" action={fileName ?? undefined} />
            <Card style={{ gap: spacing.sm }}>
              <MappingRow label="Sheet" value={parsed.mapping.sheetName} />
              <MappingRow
                label="Shape"
                value={parsed.mapping.shape === 'per_day' ? 'One row per day (clock-in/out columns)' : 'One row per punch (grouped into days)'}
              />
              <MappingRow label="Employee" value={parsed.mapping.code ? `Code → "${parsed.mapping.code}"` : parsed.mapping.email ? `Email → "${parsed.mapping.email}"` : '—'} />
              <MappingRow label="Date" value={parsed.mapping.date ? `"${parsed.mapping.date}"` : '—'} />
              {parsed.mapping.shape === 'per_day' ? (
                <>
                  <MappingRow label="Clock in / out" value={`"${parsed.mapping.clockIn}" / ${parsed.mapping.clockOut ? `"${parsed.mapping.clockOut}"` : '—'}`} />
                  {(parsed.mapping.breakStart || parsed.mapping.breakEnd) && (
                    <MappingRow label="Break" value={`"${parsed.mapping.breakStart ?? '—'}" / "${parsed.mapping.breakEnd ?? '—'}"`} />
                  )}
                </>
              ) : (
                <>
                  <MappingRow label="Time" value={parsed.mapping.time ? `"${parsed.mapping.time}"` : '—'} />
                  <MappingRow label="In/Out marker" value={parsed.mapping.status ? `"${parsed.mapping.status}"` : 'None — using punch order'} />
                </>
              )}
              <Banner tone="info" icon="information-circle-outline">
                If this looks wrong, tell me the exact column headers from your file and I’ll fix the matching.
              </Banner>
            </Card>

            <SectionTitle title="Preview" />
            <Card style={{ gap: spacing.md }}>
              <View style={styles.counts}>
                <Count label="Input rows" value={parsed.totalInputRows} />
                <Count label="Days ready" value={parsed.rows.length} tone={colors.success} />
                <Count label="Problems" value={parsed.problems.length} tone={parsed.problems.length ? colors.danger : undefined} />
              </View>

              {preview.length > 0 && (
                <View style={{ gap: spacing.sm }}>
                  {preview.map((r, i) => (
                    <View key={`${r.employee_code ?? r.email}-${r.work_date}-${i}`} style={styles.previewRow}>
                      <Text style={[type.bodyMedium, { flex: 1, minWidth: 0 }]} numberOfLines={1}>
                        {r.employee_code ?? r.email}
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
                title={busy ? `Importing… ${progress}/${parsed.rows.length}` : `Import ${parsed.rows.length} day${parsed.rows.length === 1 ? '' : 's'}`}
                icon="checkmark"
                size="lg"
                loading={busy}
                disabled={busy || parsed.rows.length === 0}
                onPress={importAll}
              />
              <Text style={type.small}>Rows with no employee code or email set are skipped. Importing again updates the same days, so it is safe to re-run.</Text>
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

function MappingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.mappingRow}>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.small, { fontFamily: fonts.semibold, color: colors.text, flexShrink: 1, textAlign: 'right' }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
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
  mappingRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  counts: { flexDirection: 'row', justifyContent: 'space-around' },
  count: { alignItems: 'center', gap: 2, minWidth: 80 },
  countValue: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.text },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
