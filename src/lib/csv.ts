import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

function escape(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Guard against spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const head = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c.key])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

/** Downloads on web; opens the share sheet on phones. */
export async function shareCsv(filename: string, csv: string) {
  if (Platform.OS === 'web') {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write('﻿' + csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: filename, UTI: 'public.comma-separated-values-text' });
}
