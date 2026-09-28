import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  // brand
  brand: '#4338CA',
  brandDark: '#312E81',
  brandDeep: '#1E1B4B',
  brandSoft: '#EEF0FF',
  brandTint: '#C7D2FE',
  accent: '#7C3AED',

  // modules
  task: '#0D9488',
  taskSoft: '#E6F7F5',
  complaint: '#E11D48',
  complaintSoft: '#FDECEF',
  feedback: '#2563EB',
  feedbackSoft: '#EAF1FE',

  // semantic
  success: '#16A34A',
  successSoft: '#E8F7EE',
  warning: '#D97706',
  warningSoft: '#FEF4E6',
  danger: '#DC2626',
  dangerSoft: '#FDECEC',
  info: '#0284C7',
  infoSoft: '#E6F4FB',

  // neutrals
  bg: '#F4F5FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F8F9FC',
  border: '#E4E7EF',
  borderStrong: '#CDD2DE',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  white: '#FFFFFF',
  overlay: 'rgba(15, 23, 42, 0.45)',
} as const;

export const gradients = {
  brand: ['#1E1B4B', '#3730A3', '#6D28D9'] as const,
  hero: ['#312E81', '#4338CA', '#7C3AED'] as const,
  task: ['#0F766E', '#14B8A6'] as const,
  complaint: ['#9F1239', '#E11D48'] as const,
  feedback: ['#1D4ED8', '#3B82F6'] as const,
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: colors.text },
  h1: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: colors.text },
  h2: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2, color: colors.text },
  h3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.text },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  smallMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  caption: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, color: colors.textMuted, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export const shadow = {
  sm: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 2 },
    default: { boxShadow: '0 1px 3px rgba(15,23,42,0.08)' } as ViewStyle,
  }),
  md: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 5 },
    default: { boxShadow: '0 6px 18px rgba(15,23,42,0.10)' } as ViewStyle,
  }),
  lg: Platform.select<ViewStyle>({
    ios: { shadowColor: '#1E1B4B', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
    android: { elevation: 10 },
    default: { boxShadow: '0 14px 32px rgba(30,27,75,0.20)' } as ViewStyle,
  }),
};

export const layout = { maxWidth: 760, screenPadding: 16 } as const;
