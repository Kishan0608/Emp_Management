import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, Card, PageHeader, Screen, Sheet, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { formatDate, roleLabel, toDateOnly } from '@/lib/format';
import type { FeedbackAudience, FeedbackType } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, shadow, spacing } from '@/theme/tokens';

type FormFeedbackType = 'work_question' | 'general_question' | 'leave' | 'feedback' | 'blocker';

type LeaveCategory = 'casual' | 'sick' | 'earned' | 'half_day' | 'short_leave' | 'emergency' | 'unpaid';

type DurationMode = 'single_day' | 'multiple_days' | 'first_half' | 'second_half' | 'custom_hours';

interface TypeOption {
  value: FormFeedbackType | null;
  label: string;
  sublabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface AudienceOption {
  value: FeedbackAudience | null;
  label: string;
  sublabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface AttachmentData {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string | null;
}

interface LeaveCategoryOption {
  id: LeaveCategory;
  name: string;
  code: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface DurationModeOption {
  id: DurationMode;
  label: string;
  sublabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface LeaveReasonOption {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const LEAVE_CATEGORIES: LeaveCategoryOption[] = [
  {
    id: 'casual',
    name: 'Casual Leave',
    code: 'CL',
    desc: 'Personal matters, family events & routine affairs',
    icon: 'sunny-outline',
    color: '#2563EB',
  },
  {
    id: 'sick',
    name: 'Sick / Medical',
    code: 'SL',
    desc: 'Health illness, doctor consultations & recovery',
    icon: 'medkit-outline',
    color: '#DC2626',
  },
  {
    id: 'earned',
    name: 'Earned / Annual',
    code: 'PL',
    desc: 'Planned vacations, annual holidays & long travel',
    icon: 'briefcase-outline',
    color: '#059669',
  },
  {
    id: 'half_day',
    name: 'Half Day',
    code: 'HD',
    desc: 'First half (morning) or second half (afternoon) shift',
    icon: 'time-outline',
    color: '#D97706',
  },
  {
    id: 'short_leave',
    name: 'Short Permission',
    code: 'SP',
    desc: '1 to 3 hours short exit during office hours',
    icon: 'stopwatch-outline',
    color: '#7C3AED',
  },
  {
    id: 'emergency',
    name: 'Emergency Leave',
    code: 'EM',
    desc: 'Urgent unpredicted situations & emergencies',
    icon: 'alert-circle-outline',
    color: '#E11D48',
  },
  {
    id: 'unpaid',
    name: 'Loss of Pay (LOP)',
    code: 'LOP',
    desc: 'Leave without pay beyond accrued allowance',
    icon: 'wallet-outline',
    color: '#64748B',
  },
];

const DURATION_MODES: DurationModeOption[] = [
  {
    id: 'single_day',
    label: 'Single Day',
    sublabel: '1 Full working day',
    icon: 'today-outline',
  },
  {
    id: 'multiple_days',
    label: 'Multiple Days',
    sublabel: 'Date range with total days count',
    icon: 'calendar-outline',
  },
  {
    id: 'first_half',
    label: 'Half Day (1st Half - Morning)',
    sublabel: '09:30 AM to 01:30 PM (4.0 hrs)',
    icon: 'partly-sunny-outline',
  },
  {
    id: 'second_half',
    label: 'Half Day (2nd Half - Afternoon)',
    sublabel: '01:30 PM to 06:30 PM (5.0 hrs)',
    icon: 'moon-outline',
  },
  {
    id: 'custom_hours',
    label: 'Custom Hours (Short Leave)',
    sublabel: 'Permission for specific hours during shift',
    icon: 'time-outline',
  },
];

const LEAVE_REASONS: LeaveReasonOption[] = [
  { id: 'personal', label: 'Personal & Family', icon: 'people-outline' },
  { id: 'illness', label: 'Illness & Health', icon: 'medkit-outline' },
  { id: 'doctor', label: 'Doctor Consultation', icon: 'fitness-outline' },
  { id: 'vacation', label: 'Vacation & Travel', icon: 'airplane-outline' },
  { id: 'urgent', label: 'Urgent Domestic Work', icon: 'home-outline' },
  { id: 'exam', label: 'Exam & Education', icon: 'school-outline' },
  { id: 'emergency', label: 'Family Emergency', icon: 'warning-outline' },
  { id: 'other', label: 'Other Reason', icon: 'ellipsis-horizontal-outline' },
];

function formatBytes(bytes?: number) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function calculateDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const d1 = new Date(`${start}T00:00:00`);
  const d2 = new Date(`${end}T00:00:00`);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : -1;
}

function formatLeaveDate(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'Select a valid date';
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    value: null,
    label: 'Select Type',
    sublabel: 'Choose post category',
    icon: 'help-circle-outline',
    color: colors.textMuted,
  },
  {
    value: 'work_question',
    label: 'Work question',
    sublabel: 'Questions about daily work, tasks, or projects',
    icon: 'briefcase-outline',
    color: colors.brand,
  },
  {
    value: 'general_question',
    label: 'General question',
    sublabel: 'General inquiries, policies, or workplace questions',
    icon: 'help-circle-outline',
    color: colors.info,
  },
  {
    value: 'leave',
    label: 'Leave',
    sublabel: 'Time-off, vacation, or medical leave request',
    icon: 'calendar-outline',
    color: colors.warning,
  },
  {
    value: 'feedback',
    label: 'Feedback',
    sublabel: 'Suggestions, ideas, or feedback for improvement',
    icon: 'chatbubble-ellipses-outline',
    color: colors.feedback,
  },
  {
    value: 'blocker',
    label: 'Blocker',
    sublabel: 'Work is stopped and requires urgent resolution',
    icon: 'hand-left-outline',
    color: colors.danger,
  },
];

export default function NewFeedback() {
  const { me, manager, settings } = useMe();
  const toast = useToast();
  const myTasks = useLoad(() => api.tasks('mine', me.id));

  // General post states
  const [kind, setKind] = useState<FormFeedbackType | null>(null);
  const [audience, setAudience] = useState<FeedbackAudience | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<AttachmentData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dedicated Leave States
  const [leaveCategory, setLeaveCategory] = useState<LeaveCategory>('casual');
  const [durationMode, setDurationMode] = useState<DurationMode>('single_day');
  const [leaveStartDate, setLeaveStartDate] = useState(() => toDateOnly(new Date()));
  const [leaveEndDate, setLeaveEndDate] = useState(() => toDateOnly(new Date()));
  const [leaveReasonCategory, setLeaveReasonCategory] = useState('personal');
  const [leaveReasonText, setLeaveReasonText] = useState('');
  const [handoverPerson, setHandoverPerson] = useState('');
  const [customTimeFrom, setCustomTimeFrom] = useState('10:00 AM');
  const [customTimeTo, setCustomTimeTo] = useState('12:00 PM');
  const [reasonInputFocused, setReasonInputFocused] = useState(false);
  const [handoverInputFocused, setHandoverInputFocused] = useState(false);

  // Dropdown states
  const [typeDdlOpen, setTypeDdlOpen] = useState(false);
  const [audienceDdlOpen, setAudienceDdlOpen] = useState(false);
  const [leaveCatDdlOpen, setLeaveCatDdlOpen] = useState(false);
  const [durationModeDdlOpen, setDurationModeDdlOpen] = useState(false);
  const [reasonDdlOpen, setReasonDdlOpen] = useState(false);
  const [taskDdlOpen, setTaskDdlOpen] = useState(false);

  // iOS Picker Sheet state
  const [iosPickerTarget, setIosPickerTarget] = useState<'startDate' | 'endDate' | 'timeFrom' | 'timeTo' | null>(null);

  const closeAllDdls = () => {
    setTypeDdlOpen(false);
    setAudienceDdlOpen(false);
    setLeaveCatDdlOpen(false);
    setDurationModeDdlOpen(false);
    setReasonDdlOpen(false);
    setTaskDdlOpen(false);
  };

  const audienceOptions: AudienceOption[] = useMemo(
    () => [
      {
        value: null,
        label: 'Select Report To',
        sublabel: 'Choose recipient',
        icon: 'paper-plane-outline',
        color: colors.textMuted,
      },
      {
        value: 'manager',
        label: manager ? `Reporting Manager (${manager.split(' ')[0]})` : 'Reporting Manager',
        sublabel: manager ? `Direct manager: ${manager}` : 'Direct reporting manager',
        icon: 'person-outline',
        color: colors.brand,
      },
      {
        value: 'hr',
        label: 'HR',
        sublabel: 'Human Resources team',
        icon: 'people-outline',
        color: colors.info,
      },
      {
        value: 'boss',
        label: 'Boss',
        sublabel: 'Executive Leadership',
        icon: 'shield-checkmark-outline',
        color: colors.warning,
      },
    ],
    [manager],
  );

  const selectedTypeObj = TYPE_OPTIONS.find((o) => o.value === kind) ?? TYPE_OPTIONS[0];
  const selectedAudienceObj = audienceOptions.find((o) => o.value === audience) ?? audienceOptions[0];
  const selectedCategoryObj = LEAVE_CATEGORIES.find((c) => c.id === leaveCategory) ?? LEAVE_CATEGORIES[0];
  const selectedDurationModeObj = DURATION_MODES.find((d) => d.id === durationMode) ?? DURATION_MODES[0];
  const selectedReasonObj = LEAVE_REASONS.find((r) => r.id === leaveReasonCategory) ?? LEAVE_REASONS[0];

  const totalDays = useMemo(() => {
    if (durationMode === 'first_half' || durationMode === 'second_half') return 0.5;
    if (durationMode === 'custom_hours') return null;
    if (durationMode === 'single_day') return 1;
    return calculateDays(leaveStartDate, leaveEndDate);
  }, [durationMode, leaveStartDate, leaveEndDate]);

  const durationBadge = useMemo(() => {
    if (durationMode === 'multiple_days') {
      return totalDays && totalDays > 0 ? `${totalDays} Days` : 'Invalid Range';
    }
    if (durationMode === 'first_half') return 'Half Day (1st Half)';
    if (durationMode === 'second_half') return 'Half Day (2nd Half)';
    if (durationMode === 'custom_hours') return `Short Leave (${customTimeFrom} – ${customTimeTo})`;
    return '1 Day';
  }, [durationMode, totalDays, customTimeFrom, customTimeTo]);

  const dateSummary = useMemo(() => {
    if (durationMode === 'multiple_days') {
      return `${formatDate(leaveStartDate)} to ${formatDate(leaveEndDate)}`;
    }
    return formatDate(leaveStartDate);
  }, [durationMode, leaveStartDate, leaveEndDate]);

  const openStartDatePicker = () => {
    closeAllDdls();
    if (Platform.OS === 'android') {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(leaveStartDate) ? new Date(`${leaveStartDate}T00:00:00`) : new Date();
      DateTimePickerAndroid.open({
        mode: 'date',
        value: isNaN(d.getTime()) ? new Date() : d,
        onValueChange: (_e, selectedDate) => {
          if (selectedDate) {
            const formatted = toDateOnly(selectedDate);
            setLeaveStartDate(formatted);
            if (durationMode === 'multiple_days' && leaveEndDate < formatted) {
              setLeaveEndDate(formatted);
            }
          }
        },
      });
    } else if (Platform.OS === 'ios') {
      setIosPickerTarget('startDate');
    }
  };

  const openEndDatePicker = () => {
    closeAllDdls();
    if (Platform.OS === 'android') {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(leaveEndDate) ? new Date(`${leaveEndDate}T00:00:00`) : new Date();
      const minD = /^\d{4}-\d{2}-\d{2}$/.test(leaveStartDate) ? new Date(`${leaveStartDate}T00:00:00`) : undefined;
      DateTimePickerAndroid.open({
        mode: 'date',
        value: isNaN(d.getTime()) ? new Date() : d,
        minimumDate: minD && !isNaN(minD.getTime()) ? minD : undefined,
        onValueChange: (_e, selectedDate) => {
          if (selectedDate) {
            setLeaveEndDate(toDateOnly(selectedDate));
          }
        },
      });
    } else if (Platform.OS === 'ios') {
      setIosPickerTarget('endDate');
    }
  };

  const openTimePicker = (which: 'timeFrom' | 'timeTo') => {
    closeAllDdls();
    if (Platform.OS === 'android') {
      const now = new Date();
      DateTimePickerAndroid.open({
        mode: 'time',
        value: now,
        is24Hour: false,
        onValueChange: (_e, selectedDate) => {
          if (selectedDate) {
            const hh = selectedDate.getHours() % 12 || 12;
            const mm = String(selectedDate.getMinutes()).padStart(2, '0');
            const ampm = selectedDate.getHours() >= 12 ? 'PM' : 'AM';
            const timeStr = `${String(hh).padStart(2, '0')}:${mm} ${ampm}`;
            if (which === 'timeFrom') setCustomTimeFrom(timeStr);
            else setCustomTimeTo(timeStr);
          }
        },
      });
    } else if (Platform.OS === 'ios') {
      setIosPickerTarget(which);
    }
  };

  const titlePlaceholder = useMemo(() => {
    switch (kind) {
      case 'work_question':
        return 'e.g. How do I proceed with this sprint task?';
      case 'general_question':
        return 'e.g. How do I apply for WFH or holidays?';
      case 'feedback':
        return 'e.g. Suggestion for team stand-up timing';
      case 'blocker':
        return 'e.g. Blocked: Waiting for database credentials';
      default:
        return 'Enter a short summary or title…';
    }
  }, [kind]);

  const detailsPlaceholder = useMemo(() => {
    switch (kind) {
      case 'work_question':
        return 'Explain your question clearly. Include what you have already tried and the task it relates to.';
      case 'general_question':
        return 'Explain your question in detail with any relevant background.';
      case 'feedback':
        return 'Share constructive thoughts, suggestions, and ideas for improvement.';
      case 'blocker':
        return 'Explain what is blocking your progress, who can help, and the urgency.';
      default:
        return 'Explain your post clearly with relevant details…';
    }
  }, [kind]);

  const activeTasks = useMemo(
    () => (myTasks.data ?? []).filter((t) => t.status === 'accepted' && !t.is_personal),
    [myTasks.data],
  );
  const selectedTask = activeTasks.find((t) => t.id === taskId);

  const pickAttachment = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];
      if ((file.size ?? 0) > 10 * 1024 * 1024) {
        setError('Files must be under 10 MB.');
        return;
      }
      setError(null);
      setAttachment({
        uri: file.uri,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
      });
    } catch {
      setError('Failed to select file or image.');
    }
  };

  const submit = async () => {
    setError(null);
    if (!kind) {
      setError('Please select a Type.');
      return;
    }
    if (!audience) {
      setError('Please select who to Report To.');
      return;
    }

    if (kind === 'leave') {
      if (!leaveStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(leaveStartDate) || isNaN(new Date(`${leaveStartDate}T00:00:00`).getTime())) {
        setError('Please enter a valid Start Date (YYYY-MM-DD).');
        return;
      }
      if (durationMode === 'multiple_days') {
        if (!leaveEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(leaveEndDate) || isNaN(new Date(`${leaveEndDate}T00:00:00`).getTime())) {
          setError('Please enter a valid End Date (YYYY-MM-DD).');
          return;
        }
        if (leaveEndDate < leaveStartDate) {
          setError('End Date cannot be earlier than Start Date.');
          return;
        }
      }
      if (leaveReasonText.trim().length < 5) {
        setError('Please provide a reason or remarks for your leave request (at least 5 characters).');
        return;
      }
    } else {
      if (title.trim().length < 3) return setError('Add a short title.');
      if (body.trim().length < 5) return setError('Please add a little more detail.');
    }

    setBusy(true);
    try {
      let formattedTitle = '';
      let finalBody = '';

      const attachmentText = attachment
        ? `\n\n📎 Attachment: ${attachment.name}${attachment.size ? ` (${formatBytes(attachment.size)})` : ''}`
        : '';

      if (kind === 'leave') {
        formattedTitle = `[Leave] ${selectedCategoryObj.name} (${durationBadge}) · ${dateSummary}`;

        const lines = [
          '📋 **LEAVE APPLICATION**',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          `• **Applicant**: ${me.full_name} (${roleLabel[me.role] ?? 'Employee'})`,
          `• **Leave Type**: ${selectedCategoryObj.name} (${selectedCategoryObj.code})`,
          `• **Duration Mode**: ${selectedDurationModeObj.label} (${durationBadge})`,
          `• **Date(s)**: ${dateSummary}`,
        ];

        if (durationMode === 'first_half') {
          lines.push('• **Shift Timing**: First Half (09:30 AM – 01:30 PM)');
        } else if (durationMode === 'second_half') {
          lines.push('• **Shift Timing**: Second Half (01:30 PM – 06:30 PM)');
        } else if (durationMode === 'custom_hours') {
          lines.push(`• **Shift Hours**: ${customTimeFrom} – ${customTimeTo}`);
        }

        lines.push(`• **Reason Category**: ${selectedReasonObj.label}`);
        lines.push(`• **Work Handover**: ${handoverPerson.trim() || 'Self-managed / None'}`);
        lines.push('');
        lines.push('📝 **Reason & Detailed Remarks**:');
        lines.push(leaveReasonText.trim());

        finalBody = `${lines.join('\n')}${attachmentText}`;
      } else {
        formattedTitle =
          kind === 'work_question'
            ? `[Work Question] ${title.trim()}`
            : kind === 'general_question'
              ? `[General Question] ${title.trim()}`
              : title.trim();

        finalBody = `${body.trim()}${attachmentText}`;
      }

      const dbType: FeedbackType =
        kind === 'work_question' || kind === 'general_question'
          ? 'question'
          : kind === 'blocker'
            ? 'blocker'
            : 'feedback';

      const id = await api.submitFeedback({
        type: dbType,
        audience,
        title: formattedTitle,
        body: finalBody,
        anonymous: false,
        taskId: kind === 'blocker' ? taskId : null,
      });

      toast(
        kind === 'blocker'
          ? 'Blocker raised. Your manager has been notified.'
          : kind === 'leave'
            ? 'Leave request submitted to your manager.'
            : 'Sent',
      );
      router.replace(`/feedback/${id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      keyboard
      header={
        <PageHeader
          title={kind === 'leave' ? 'Apply for Leave' : 'New post'}
          subtitle={
            kind === 'leave'
              ? 'Submit formal time-off request with full schedule'
              : 'Leave, work question, feedback, or blocker'
          }
        />
      }
      footer={
        <Button
          title={kind === 'blocker' ? 'Raise blocker' : kind === 'leave' ? 'Submit leave' : 'Send'}
          icon={kind === 'blocker' ? 'hand-left-outline' : kind === 'leave' ? 'calendar-outline' : 'paper-plane'}
          size="lg"
          loading={busy}
          onPress={submit}
        />
      }>
      <View style={{ gap: spacing.lg }}>
        {error && <Banner tone="danger">{error}</Banner>}

        {/* 1. TYPE & REPORT TO CONNECTED DDLS */}
        <Card style={styles.sectionCard}>
          {/* TYPE DDL */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Type *</Text>
            <Pressable
              onPress={() => {
                closeAllDdls();
                setTypeDdlOpen(!typeDdlOpen);
              }}
              accessibilityRole="button"
              accessibilityLabel="Select post type"
              style={[styles.fieldWrap, typeDdlOpen && styles.fieldWrapDdlOpen]}>
              <View style={[styles.fieldIconSlot, { backgroundColor: (selectedTypeObj.color || colors.brand) + '1A' }]}>
                <Ionicons name={selectedTypeObj.icon} size={16} color={selectedTypeObj.color || colors.brand} />
              </View>
              <View style={styles.fieldTextSlot}>
                <Text style={[styles.fieldValueText, !kind && styles.fieldPlaceholderText]} numberOfLines={1}>
                  {selectedTypeObj.label}
                </Text>
              </View>
              <Ionicons name={typeDdlOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>

            {typeDdlOpen && (
              <View style={styles.ddlContainer}>
                {TYPE_OPTIONS.map((item, idx) => {
                  const active = item.value === kind;
                  return (
                    <Pressable
                      key={item.value ?? '__placeholder'}
                      onPress={() => {
                        setKind(item.value);
                        setTypeDdlOpen(false);
                        if (item.value === 'leave' && !audience) {
                          setAudience('manager');
                        }
                      }}
                      style={({ pressed }) => [
                        styles.ddlOption,
                        active && styles.ddlOptionActive,
                        pressed && styles.ddlOptionPressed,
                        idx < TYPE_OPTIONS.length - 1 && styles.ddlOptionBorder,
                      ]}>
                      <View style={[styles.fieldIconSlot, { backgroundColor: (item.color || colors.brand) + '1A' }]}>
                        <Ionicons name={item.icon} size={16} color={item.color || colors.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ddlOptionTitle, active && { color: item.color, fontFamily: fonts.bold }]}>
                          {item.label}
                        </Text>
                        <Text style={styles.ddlOptionSubtitle}>{item.sublabel}</Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={18} color={item.color || colors.brand} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* BLOCKER WARNING BANNER */}
          {kind === 'blocker' && (
            <Banner tone="warning" title="Work is stopped">
              {`Your manager is notified now. If nobody answers, it escalates to HR after ${settings.blocker_hr_hours} hours and to the Boss after ${settings.blocker_boss_hours} hours.`}
            </Banner>
          )}

          {/* REPORT TO DDL */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Report to *</Text>
            <Pressable
              onPress={() => {
                closeAllDdls();
                setAudienceDdlOpen(!audienceDdlOpen);
              }}
              accessibilityRole="button"
              accessibilityLabel="Select who to report to"
              style={[styles.fieldWrap, audienceDdlOpen && styles.fieldWrapDdlOpen]}>
              <View style={[styles.fieldIconSlot, { backgroundColor: (selectedAudienceObj.color || colors.brand) + '1A' }]}>
                <Ionicons name={selectedAudienceObj.icon} size={16} color={selectedAudienceObj.color || colors.brand} />
              </View>
              <View style={styles.fieldTextSlot}>
                <Text style={[styles.fieldValueText, !audience && styles.fieldPlaceholderText]} numberOfLines={1}>
                  {selectedAudienceObj.label}
                </Text>
              </View>
              <Ionicons name={audienceDdlOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>

            {audienceDdlOpen && (
              <View style={styles.ddlContainer}>
                {audienceOptions.map((item, idx) => {
                  const active = item.value === audience;
                  return (
                    <Pressable
                      key={item.value ?? '__placeholder'}
                      onPress={() => {
                        setAudience(item.value);
                        setAudienceDdlOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.ddlOption,
                        active && styles.ddlOptionActive,
                        pressed && styles.ddlOptionPressed,
                        idx < audienceOptions.length - 1 && styles.ddlOptionBorder,
                      ]}>
                      <View style={[styles.fieldIconSlot, { backgroundColor: (item.color || colors.brand) + '1A' }]}>
                        <Ionicons name={item.icon} size={16} color={item.color || colors.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ddlOptionTitle, active && { color: item.color, fontFamily: fonts.bold }]}>
                          {item.label}
                        </Text>
                        <Text style={styles.ddlOptionSubtitle}>{item.sublabel}</Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={18} color={item.color || colors.brand} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </Card>

        {/* 2. DEDICATED LEAVE FORM WORKFLOW */}
        {kind === 'leave' ? (
          <>
            {/* LEAVE CLASSIFICATION & DURATION MODE (SEPARATE DDLS) */}
            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderIconWrap}>
                  <Ionicons name="calendar" size={18} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionHeading}>Leave Classification & Schedule</Text>
                  <Text style={styles.sectionSubheading}>Select leave category, duration & dates</Text>
                </View>
              </View>

              {/* 1. LEAVE CLASSIFICATION DDL */}
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>Leave Classification *</Text>
                <Pressable
                  onPress={() => {
                    closeAllDdls();
                    setLeaveCatDdlOpen(!leaveCatDdlOpen);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Select leave classification"
                  style={[styles.fieldWrap, leaveCatDdlOpen && styles.fieldWrapDdlOpen]}>
                  <View style={[styles.fieldIconSlot, { backgroundColor: selectedCategoryObj.color + '1A' }]}>
                    <Ionicons name={selectedCategoryObj.icon} size={16} color={selectedCategoryObj.color} />
                  </View>
                  <View style={styles.fieldTextSlot}>
                    <Text style={styles.fieldValueText} numberOfLines={1}>
                      {selectedCategoryObj.name}
                    </Text>
                  </View>
                  <Ionicons name={leaveCatDdlOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                </Pressable>

                {leaveCatDdlOpen && (
                  <View style={styles.ddlContainer}>
                    {LEAVE_CATEGORIES.map((cat, idx) => {
                      const active = cat.id === leaveCategory;
                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => {
                            setLeaveCategory(cat.id);
                            setLeaveCatDdlOpen(false);
                            if (cat.id === 'half_day') {
                              setDurationMode('first_half');
                            } else if (cat.id === 'short_leave') {
                              setDurationMode('custom_hours');
                            } else if (durationMode === 'first_half' || durationMode === 'second_half' || durationMode === 'custom_hours') {
                              setDurationMode('single_day');
                            }
                          }}
                          style={({ pressed }) => [
                            styles.ddlOption,
                            active && styles.ddlOptionActive,
                            pressed && styles.ddlOptionPressed,
                            idx < LEAVE_CATEGORIES.length - 1 && styles.ddlOptionBorder,
                          ]}>
                          <View style={[styles.fieldIconSlot, { backgroundColor: cat.color + '1A' }]}>
                            <Ionicons name={cat.icon} size={16} color={cat.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.ddlOptionTitle, active && { color: cat.color, fontFamily: fonts.bold }]}>
                                {cat.name}
                              </Text>
                              <View style={[styles.miniCodeBadge, active && { backgroundColor: cat.color }]}>
                                <Text style={[styles.miniCodeText, active && { color: colors.white }]}>{cat.code}</Text>
                              </View>
                            </View>
                            <Text style={styles.ddlOptionSubtitle}>{cat.desc}</Text>
                          </View>
                          {active && <Ionicons name="checkmark-circle" size={18} color={cat.color} />}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* 2. DURATION MODE DDL */}
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>Duration Mode *</Text>
                <Pressable
                  onPress={() => {
                    closeAllDdls();
                    setDurationModeDdlOpen(!durationModeDdlOpen);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Select duration mode"
                  style={[styles.fieldWrap, durationModeDdlOpen && styles.fieldWrapDdlOpen]}>
                  <View style={[styles.fieldIconSlot, { backgroundColor: colors.brandSoft }]}>
                    <Ionicons name={selectedDurationModeObj.icon} size={16} color={colors.brand} />
                  </View>
                  <View style={styles.fieldTextSlot}>
                    <Text style={styles.fieldValueText} numberOfLines={1}>
                      {selectedDurationModeObj.label}
                    </Text>
                  </View>
                  <Ionicons name={durationModeDdlOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                </Pressable>

                {durationModeDdlOpen && (
                  <View style={styles.ddlContainer}>
                    {DURATION_MODES.map((dm, idx) => {
                      const active = dm.id === durationMode;
                      return (
                        <Pressable
                          key={dm.id}
                          onPress={() => {
                            setDurationMode(dm.id);
                            setDurationModeDdlOpen(false);
                          }}
                          style={({ pressed }) => [
                            styles.ddlOption,
                            active && styles.ddlOptionActive,
                            pressed && styles.ddlOptionPressed,
                            idx < DURATION_MODES.length - 1 && styles.ddlOptionBorder,
                          ]}>
                          <View style={[styles.fieldIconSlot, { backgroundColor: colors.brandSoft }]}>
                            <Ionicons name={dm.icon} size={16} color={colors.brand} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.ddlOptionTitle, active && { color: colors.brand, fontFamily: fonts.bold }]}>
                              {dm.label}
                            </Text>
                            <Text style={styles.ddlOptionSubtitle}>{dm.sublabel}</Text>
                          </View>
                          {active && <Ionicons name="checkmark-circle" size={18} color={colors.brand} />}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* 3. DATES & SCHEDULE */}
              <View style={{ gap: 14, marginTop: 4 }}>
                {/* START DATE / SINGLE LEAVE DATE */}
                <View style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>
                    {durationMode === 'multiple_days' ? 'From Date (Start) *' : 'Leave Date *'}
                  </Text>
                  {Platform.OS === 'web' ? (
                    <View style={styles.fieldWrap}>
                      <View style={[styles.fieldIconSlot, { backgroundColor: colors.brandSoft }]}>
                        <Ionicons name="calendar-outline" size={16} color={colors.brand} />
                      </View>
                      <TextInput
                        value={leaveStartDate}
                        onChangeText={(t) => {
                          setLeaveStartDate(t);
                          if (durationMode === 'multiple_days' && leaveEndDate < t) {
                            setLeaveEndDate(t);
                          }
                        }}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.textMuted}
                        maxLength={10}
                        style={styles.fieldInput}
                      />
                      <Text style={styles.inlineWebDateHint}>{formatLeaveDate(leaveStartDate)}</Text>
                      <Pressable
                        onPress={openStartDatePicker}
                        accessibilityRole="button"
                        accessibilityLabel="Open calendar"
                        style={({ pressed }) => [styles.fieldRightActionBtn, pressed && { opacity: 0.7 }]}>
                        <Ionicons name="calendar" size={18} color={colors.brand} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={openStartDatePicker}
                      accessibilityRole="button"
                      accessibilityLabel="Open calendar"
                      style={styles.fieldWrap}>
                      <View style={[styles.fieldIconSlot, { backgroundColor: colors.brandSoft }]}>
                        <Ionicons name="calendar-outline" size={16} color={colors.brand} />
                      </View>
                      <View style={styles.fieldTextSlot}>
                        <Text style={styles.fieldValueText} numberOfLines={1}>
                          {formatLeaveDate(leaveStartDate)}
                        </Text>
                      </View>
                      <View style={styles.fieldRightActionBtn}>
                        <Ionicons name="calendar" size={18} color={colors.brand} />
                      </View>
                    </Pressable>
                  )}
                </View>

                {/* END DATE (ONLY FOR MULTIPLE DAYS) */}
                {durationMode === 'multiple_days' && (
                  <View style={{ gap: 6 }}>
                    <Text style={styles.fieldLabel}>To Date (End) *</Text>
                    {Platform.OS === 'web' ? (
                      <View style={styles.fieldWrap}>
                        <View style={[styles.fieldIconSlot, { backgroundColor: colors.brandSoft }]}>
                          <Ionicons name="calendar-outline" size={16} color={colors.brand} />
                        </View>
                        <TextInput
                          value={leaveEndDate}
                          onChangeText={setLeaveEndDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.textMuted}
                          maxLength={10}
                          style={styles.fieldInput}
                        />
                        <Text style={styles.inlineWebDateHint}>{formatLeaveDate(leaveEndDate)}</Text>
                        <Pressable
                          onPress={openEndDatePicker}
                          accessibilityRole="button"
                          accessibilityLabel="Open calendar"
                          style={({ pressed }) => [styles.fieldRightActionBtn, pressed && { opacity: 0.7 }]}>
                          <Ionicons name="calendar" size={18} color={colors.brand} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={openEndDatePicker}
                        accessibilityRole="button"
                        accessibilityLabel="Open calendar"
                        style={styles.fieldWrap}>
                        <View style={[styles.fieldIconSlot, { backgroundColor: colors.brandSoft }]}>
                          <Ionicons name="calendar-outline" size={16} color={colors.brand} />
                        </View>
                        <View style={styles.fieldTextSlot}>
                          <Text style={styles.fieldValueText} numberOfLines={1}>
                            {formatLeaveDate(leaveEndDate)}
                          </Text>
                        </View>
                        <View style={styles.fieldRightActionBtn}>
                          <Ionicons name="calendar" size={18} color={colors.brand} />
                        </View>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* CUSTOM HOURS (SHORT PERMISSION) FROM & TO TIME WITH CLOCK ICONS */}
                {durationMode === 'custom_hours' && (
                  <View style={styles.timeRowContainer}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={styles.fieldLabel}>From Time *</Text>
                      {Platform.OS === 'web' ? (
                        <View style={styles.fieldWrap}>
                          <View style={[styles.fieldIconSlot, { backgroundColor: colors.brandSoft }]}>
                            <Ionicons name="time-outline" size={16} color={colors.brand} />
                          </View>
                          <TextInput
                            value={customTimeFrom}
                            onChangeText={setCustomTimeFrom}
                            placeholder="10:00 AM"
                            placeholderTextColor={colors.textMuted}
                            style={styles.fieldInput}
                          />
                          <Pressable
                            onPress={() => openTimePicker('timeFrom')}
                            accessibilityRole="button"
                            accessibilityLabel="Open clock"
                            style={({ pressed }) => [styles.fieldRightActionBtn, pressed && { opacity: 0.7 }]}>
                            <Ionicons name="time" size={18} color={colors.brand} />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => openTimePicker('timeFrom')}
                          accessibilityRole="button"
                          accessibilityLabel="Open clock"
                          style={styles.fieldWrap}>
                          <View style={[styles.fieldIconSlot, { backgroundColor: colors.brandSoft }]}>
                            <Ionicons name="time-outline" size={16} color={colors.brand} />
                          </View>
                          <View style={styles.fieldTextSlot}>
                            <Text style={styles.fieldValueText} numberOfLines={1}>
                              {customTimeFrom}
                            </Text>
                          </View>
                          <View style={styles.fieldRightActionBtn}>
                            <Ionicons name="time" size={18} color={colors.brand} />
                          </View>
                        </Pressable>
                      )}
                    </View>

                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={styles.fieldLabel}>To Time *</Text>
                      {Platform.OS === 'web' ? (
                        <View style={styles.fieldWrap}>
                          <View style={[styles.fieldIconSlot, { backgroundColor: colors.brandSoft }]}>
                            <Ionicons name="time-outline" size={16} color={colors.brand} />
                          </View>
                          <TextInput
                            value={customTimeTo}
                            onChangeText={setCustomTimeTo}
                            placeholder="12:00 PM"
                            placeholderTextColor={colors.textMuted}
                            style={styles.fieldInput}
                          />
                          <Pressable
                            onPress={() => openTimePicker('timeTo')}
                            accessibilityRole="button"
                            accessibilityLabel="Open clock"
                            style={({ pressed }) => [styles.fieldRightActionBtn, pressed && { opacity: 0.7 }]}>
                            <Ionicons name="time" size={18} color={colors.brand} />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => openTimePicker('timeTo')}
                          accessibilityRole="button"
                          accessibilityLabel="Open clock"
                          style={styles.fieldWrap}>
                          <View style={[styles.fieldIconSlot, { backgroundColor: colors.brandSoft }]}>
                            <Ionicons name="time-outline" size={16} color={colors.brand} />
                          </View>
                          <View style={styles.fieldTextSlot}>
                            <Text style={styles.fieldValueText} numberOfLines={1}>
                              {customTimeTo}
                            </Text>
                          </View>
                          <View style={styles.fieldRightActionBtn}>
                            <Ionicons name="time" size={18} color={colors.brand} />
                          </View>
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}

                {/* CALCULATED DURATION BADGE */}
                <View
                  style={[
                    styles.durationBadgeBox,
                    totalDays !== null && totalDays <= 0 && styles.durationBadgeBoxError,
                  ]}>
                  <Ionicons
                    name={totalDays !== null && totalDays <= 0 ? 'alert-circle' : 'checkmark-circle'}
                    size={18}
                    color={totalDays !== null && totalDays <= 0 ? colors.danger : colors.success}
                  />
                  <View style={{ flex: 1 }}>
                    {totalDays !== null && totalDays <= 0 ? (
                      <Text style={styles.durationBadgeTextError}>
                        End date cannot be earlier than Start date
                      </Text>
                    ) : (
                      <Text style={styles.durationBadgeText}>
                        Total Duration: <Text style={{ fontFamily: fonts.bold }}>{durationBadge}</Text> ({dateSummary})
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </Card>

            {/* REASON & HANDOVER DETAILS */}
            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.sectionHeaderIconWrap, { backgroundColor: colors.feedbackSoft }]}>
                  <Ionicons name="document-text" size={18} color={colors.feedback} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionHeading}>Reason & Responsibility</Text>
                  <Text style={styles.sectionSubheading}>Provide context and work coverage plan</Text>
                </View>
              </View>

              {/* REASON CLASSIFICATION DDL */}
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>Reason Classification *</Text>
                <Pressable
                  onPress={() => {
                    closeAllDdls();
                    setReasonDdlOpen(!reasonDdlOpen);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Select reason classification"
                  style={[styles.ddlTrigger, reasonDdlOpen && styles.ddlTriggerActive]}>
                  <Ionicons name={selectedReasonObj.icon} size={18} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ddlTriggerText} numberOfLines={1}>
                      {selectedReasonObj.label}
                    </Text>
                  </View>
                  <Ionicons name={reasonDdlOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                </Pressable>

                {reasonDdlOpen && (
                  <View style={styles.ddlContainer}>
                    {LEAVE_REASONS.map((r, idx) => {
                      const active = r.id === leaveReasonCategory;
                      return (
                        <Pressable
                          key={r.id}
                          onPress={() => {
                            setLeaveReasonCategory(r.id);
                            setReasonDdlOpen(false);
                          }}
                          style={({ pressed }) => [
                            styles.ddlOption,
                            active && styles.ddlOptionActive,
                            pressed && styles.ddlOptionPressed,
                            idx < LEAVE_REASONS.length - 1 && styles.ddlOptionBorder,
                          ]}>
                          <Ionicons name={r.icon} size={18} color={active ? colors.brand : colors.textMuted} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.ddlOptionTitle, active && { color: colors.brand, fontFamily: fonts.bold }]}>
                              {r.label}
                            </Text>
                          </View>
                          {active && <Ionicons name="checkmark-circle" size={18} color={colors.brand} />}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* DETAILED REASON TEXTAREA */}
              <TextField
                label="Detailed Reason & Explanation *"
                value={leaveReasonText}
                onChangeText={setLeaveReasonText}
                placeholder="Explain the reason for your leave request in detail, including context and any urgent handover instructions…"
                multiline
                counter={2000}
              />

              {/* WORK HANDOVER (CLEAN TEXTFIELD WITHOUT HINT LINE) */}
              <TextField
                label="Work Handover / Backup Colleague (Optional)"
                value={handoverPerson}
                onChangeText={setHandoverPerson}
                placeholder="e.g. Rahul Sharma (covering pending PRs and active client queries)"
                icon="person-outline"
                counter={100}
              />
            </Card>

            {/* ATTACHMENT BOX */}
            <Card style={styles.sectionCard}>
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>Supporting Document / Certificate (Optional)</Text>
                <Text style={styles.fieldSubhint}>
                  Doctor prescription, hospital slip, travel ticket, or invitation (under 10 MB)
                </Text>

                {attachment ? (
                  <View style={styles.attachmentBox}>
                    <View style={styles.attachmentLeft}>
                      <View style={styles.attachmentIconWrap}>
                        <Ionicons
                          name={
                            attachment.mimeType?.startsWith('image/')
                              ? 'image-outline'
                              : 'document-text-outline'
                          }
                          size={22}
                          color={colors.brand}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.attachmentName} numberOfLines={1}>
                          {attachment.name}
                        </Text>
                        <Text style={styles.attachmentSize}>
                          {formatBytes(attachment.size)} {attachment.mimeType ? `· ${attachment.mimeType}` : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Pressable
                        onPress={pickAttachment}
                        style={({ pressed }) => [styles.browseSmallBtn, pressed && { opacity: 0.7 }]}
                        accessibilityRole="button"
                        accessibilityLabel="Change attachment">
                        <Text style={styles.browseSmallText}>Change</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setAttachment(null)}
                        style={({ pressed }) => [styles.removeAttachBtn, pressed && { opacity: 0.7 }]}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Remove attachment">
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={pickAttachment}
                    accessibilityRole="button"
                    accessibilityLabel="Browse attachment"
                    style={({ pressed }) => [
                      styles.browseBox,
                      pressed && { borderColor: colors.brand, backgroundColor: colors.brandSoft },
                    ]}>
                    <View style={styles.browseIconCircle}>
                      <Ionicons name="cloud-upload-outline" size={22} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.browseTitle}>Attach proof, ticket, or medical slip</Text>
                      <Text style={styles.browseSub}>PDF, JPG, PNG or document up to 10 MB</Text>
                    </View>
                    <View style={styles.browseButtonBadge}>
                      <Ionicons name="folder-open-outline" size={15} color={colors.brand} />
                      <Text style={styles.browseButtonText}>Browse</Text>
                    </View>
                  </Pressable>
                )}
              </View>
            </Card>
          </>
        ) : (
          /* STANDARD FORM FOR QUESTION, FEEDBACK & BLOCKER */
          <Card style={styles.sectionCard}>
            <TextField
              label="Title *"
              value={title}
              onChangeText={setTitle}
              placeholder={titlePlaceholder}
              counter={160}
            />
            <TextField
              label="Details *"
              value={body}
              onChangeText={setBody}
              placeholder={detailsPlaceholder}
              multiline
              counter={4000}
            />

            {/* ATTACHMENT FIELD */}
            <View style={{ gap: 6, marginTop: 4 }}>
              <Text style={styles.fieldLabel}>Attachment (optional)</Text>
              {attachment ? (
                <View style={styles.attachmentBox}>
                  <View style={styles.attachmentLeft}>
                    <View style={styles.attachmentIconWrap}>
                      <Ionicons
                        name={
                          attachment.mimeType?.startsWith('image/')
                            ? 'image-outline'
                            : 'document-text-outline'
                        }
                        size={22}
                        color={colors.brand}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {attachment.name}
                      </Text>
                      <Text style={styles.attachmentSize}>
                        {formatBytes(attachment.size)} {attachment.mimeType ? `· ${attachment.mimeType}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Pressable
                      onPress={pickAttachment}
                      style={({ pressed }) => [styles.browseSmallBtn, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Change attachment">
                      <Text style={styles.browseSmallText}>Change</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setAttachment(null)}
                      style={({ pressed }) => [styles.removeAttachBtn, pressed && { opacity: 0.7 }]}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove attachment">
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={pickAttachment}
                  accessibilityRole="button"
                  accessibilityLabel="Browse attachment"
                  style={({ pressed }) => [
                    styles.browseBox,
                    pressed && { borderColor: colors.brand, backgroundColor: colors.brandSoft },
                  ]}>
                  <View style={styles.browseIconCircle}>
                    <Ionicons name="cloud-upload-outline" size={22} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.browseTitle}>Browse & select file or image</Text>
                    <Text style={styles.browseSub}>PDF, documents, PNG, JPG up to 10 MB</Text>
                  </View>
                  <View style={styles.browseButtonBadge}>
                    <Ionicons name="folder-open-outline" size={15} color={colors.brand} />
                    <Text style={styles.browseButtonText}>Browse</Text>
                  </View>
                </Pressable>
              )}
            </View>

            {/* BLOCKED TASK INLINE DDL */}
            {kind === 'blocker' && activeTasks.length > 0 && (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={styles.fieldLabel}>Blocked task (optional)</Text>
                <Pressable
                  onPress={() => {
                    closeAllDdls();
                    setTaskDdlOpen(!taskDdlOpen);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Choose blocked task"
                  style={[styles.ddlTrigger, taskDdlOpen && styles.ddlTriggerActive]}>
                  <Ionicons name="checkbox-outline" size={18} color={taskId ? colors.brand : colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ddlTriggerText, !taskId && styles.ddlTriggerPlaceholder]} numberOfLines={1}>
                      {selectedTask ? selectedTask.title : 'Select a blocked task (optional)'}
                    </Text>
                  </View>
                  {taskId ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        setTaskId(null);
                      }}
                      hitSlop={10}
                      accessibilityLabel="Clear blocked task">
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </Pressable>
                  ) : (
                    <Ionicons name={taskDdlOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                  )}
                </Pressable>

                {taskDdlOpen && (
                  <View style={styles.ddlContainer}>
                    <Pressable
                      onPress={() => {
                        setTaskId(null);
                        setTaskDdlOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.ddlOption,
                        !taskId && styles.ddlOptionActive,
                        pressed && styles.ddlOptionPressed,
                        styles.ddlOptionBorder,
                      ]}>
                      <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ddlOptionTitle}>None (General Blocker)</Text>
                        <Text style={styles.ddlOptionSubtitle}>Not tied to a specific accepted task</Text>
                      </View>
                      {!taskId && <Ionicons name="checkmark-circle" size={18} color={colors.brand} />}
                    </Pressable>
                    {activeTasks.map((t, idx) => {
                      const active = t.id === taskId;
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => {
                            setTaskId(t.id);
                            setTaskDdlOpen(false);
                          }}
                          style={({ pressed }) => [
                            styles.ddlOption,
                            active && styles.ddlOptionActive,
                            pressed && styles.ddlOptionPressed,
                            idx < activeTasks.length - 1 && styles.ddlOptionBorder,
                          ]}>
                          <Ionicons name="checkbox-outline" size={18} color={active ? colors.brand : colors.textMuted} />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[styles.ddlOptionTitle, active && { color: colors.brand, fontFamily: fonts.bold }]}
                              numberOfLines={1}>
                              {t.title}
                            </Text>
                            <Text style={styles.ddlOptionSubtitle}>Task ID: {t.id.slice(0, 8)}</Text>
                          </View>
                          {active && <Ionicons name="checkmark-circle" size={18} color={colors.brand} />}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </Card>
        )}
      </View>

      {/* IOS DATE / TIME PICKER SHEET */}
      {Platform.OS === 'ios' && (
        <Sheet
          visible={!!iosPickerTarget}
          onClose={() => setIosPickerTarget(null)}
          title={
            iosPickerTarget === 'startDate'
              ? 'Select Leave Start Date'
              : iosPickerTarget === 'endDate'
                ? 'Select Leave End Date'
                : iosPickerTarget === 'timeFrom'
                  ? 'Select From Time'
                  : 'Select To Time'
          }>
          {iosPickerTarget && (
            <DateTimePicker
              value={
                iosPickerTarget === 'startDate'
                  ? (/^\d{4}-\d{2}-\d{2}$/.test(leaveStartDate) ? new Date(`${leaveStartDate}T00:00:00`) : new Date())
                  : iosPickerTarget === 'endDate'
                    ? (/^\d{4}-\d{2}-\d{2}$/.test(leaveEndDate) ? new Date(`${leaveEndDate}T00:00:00`) : new Date())
                    : new Date()
              }
              mode={iosPickerTarget.startsWith('time') ? 'time' : 'date'}
              display={iosPickerTarget.startsWith('time') ? 'spinner' : 'inline'}
              accentColor={colors.brand}
              themeVariant="light"
              onValueChange={(_e, d) => {
                if (!d) return;
                if (iosPickerTarget === 'startDate') {
                  const v = toDateOnly(d);
                  setLeaveStartDate(v);
                  if (durationMode === 'multiple_days' && leaveEndDate < v) setLeaveEndDate(v);
                } else if (iosPickerTarget === 'endDate') {
                  setLeaveEndDate(toDateOnly(d));
                } else if (iosPickerTarget === 'timeFrom') {
                  const hh = d.getHours() % 12 || 12;
                  const mm = String(d.getMinutes()).padStart(2, '0');
                  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
                  setCustomTimeFrom(`${String(hh).padStart(2, '0')}:${mm} ${ampm}`);
                } else if (iosPickerTarget === 'timeTo') {
                  const hh = d.getHours() % 12 || 12;
                  const mm = String(d.getMinutes()).padStart(2, '0');
                  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
                  setCustomTimeTo(`${String(hh).padStart(2, '0')}:${mm} ${ampm}`);
                }
              }}
            />
          )}
          <Button title="Done" size="lg" onPress={() => setIosPickerTarget(null)} style={{ marginTop: spacing.md }} />
        </Sheet>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    gap: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeaderIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeading: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: colors.text,
  },
  sectionSubheading: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  fieldSubhint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  ddlTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ddlTriggerActive: {
    borderColor: colors.brand,
    backgroundColor: '#FFFDF7',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  ddlTriggerText: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: colors.text,
  },
  ddlTriggerPlaceholder: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  ddlTriggerSubtext: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  ddlContainer: {
    marginTop: -1.5,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.md,
  },
  ddlOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  ddlOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ddlOptionActive: {
    backgroundColor: colors.brandSoft,
  },
  ddlOptionPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  ddlOptionTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
  },
  ddlOptionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  ddlIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCodeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniCodeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.textSecondary,
  },

  // Field with Right-Side Calendar / Clock Icon Button
  inputWithIconBtnWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingLeft: spacing.md,
    paddingRight: 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fieldInnerInput: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 8,
  },
  fieldRightIconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brandTint,
  },
  dateFormattedPreview: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.brand,
    marginTop: 1,
  },
  timeRowContainer: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  // Calculated duration badge
  durationBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  durationBadgeBoxError: {
    backgroundColor: colors.dangerSoft,
    borderColor: '#FECACA',
  },
  durationBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.success,
  },
  durationBadgeTextError: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    color: colors.danger,
  },

  // Attachment styles
  attachmentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  attachmentLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  attachmentIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachmentName: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: colors.text,
  },
  attachmentSize: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  browseSmallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  browseSmallText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text,
  },
  removeAttachBtn: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  browseBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  browseIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  browseTitle: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.text,
  },
  browseSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  browseButtonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  browseButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    color: colors.brand,
  },
});
