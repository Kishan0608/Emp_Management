import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme/tokens';

const SECTIONS: [string, string][] = [
  [
    'What we collect',
    'Your name, work email, role, team, manager, and the tasks, feedback and questions you create. HR may also hold contact details, attendance, salary and performance records.',
  ],
  [
    'Why we use it',
    'To assign and review work, answer questions and resolve blockers. We do not use it for anything else or sell it.',
  ],
  [
    'Who can see it',
    'Only people whose role needs it. The Boss decides, field by field, who can see contact, salary, attendance, task history and performance details. Every change to those settings is logged.',
  ],
  [
    'How long we keep it',
    'Audit logs are kept for 5 years. Read notifications are removed after 180 days.',
  ],
  [
    'Your rights',
    'Under the Digital Personal Data Protection Act, 2023 you can ask to see, correct or erase your data, and raise a grievance. Contact HR, who acts as the grievance officer for this app.',
  ],
];

export function PrivacyNotice() {
  return (
    <View style={{ gap: spacing.lg }}>
      {SECTIONS.map(([h, b]) => (
        <View key={h} style={{ gap: 4 }}>
          <Text style={styles.h}>{h}</Text>
          <Text style={styles.b}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text },
  b: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, color: colors.textSecondary },
});
