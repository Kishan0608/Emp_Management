import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Screen,
  Sheet,
  TextField,
} from '@/components/ui';
import { DialogButton, PickerDialog, TimeDialog } from '@/components/ClockDial';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { formatDate, roleLabel, toDateOnly } from '@/lib/format';
import type { TaskPriority } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, shadow, spacing } from '@/theme/tokens';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PRIORITY_OPTIONS: {
  value: TaskPriority;
  label: string;
  sublabel: string;
  icon: any;
  color: string;
}[] = [
  { value: 'low', label: 'Low', sublabel: 'Relaxed timeline', icon: 'flag-outline', color: colors.textSecondary },
  { value: 'medium', label: 'Medium', sublabel: 'Standard workflow', icon: 'checkmark-circle-outline', color: colors.info },
  { value: 'high', label: 'High', sublabel: 'Needs prompt attention', icon: 'warning-outline', color: colors.warning },
  { value: 'urgent', label: 'Urgent', sublabel: 'Immediate action required', icon: 'flame', color: colors.danger },
];

export default function NewTask() {
  const { me, isBoss, isHR, isManager, isEmployee } = useMe();
  const { selectedOrgId } = useOrganization();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const people = useLoad(() => api.taskAssignees(isBoss ? selectedOrgId : null), [selectedOrgId]);

  // Task form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { assignee } = useLocalSearchParams<{ assignee?: string }>();
  const [assigneeId, setAssigneeId] = useState<string | null>(assignee ?? null);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & picker dropdown states
  const [assigneeSearchOpen, setAssigneeSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityDdlOpen, setPriorityDdlOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedHour, setSelectedHour] = useState(5);
  const [selectedMinute, setSelectedMinute] = useState('30');
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('PM');

  // Assignable people based on role permissions
  const assignable = useMemo(() => {
    const list = people.data ?? [];
    return list.filter((p) => {
      if (!p.is_active) return false;
      if (isBoss) return true;
      if (isHR) return p.role === 'employee' || p.role === 'hr';
      if (isManager) return p.manager_id === me.id;
      return false;
    });
  }, [people.data, me.id, isBoss, isHR, isManager]);

  const selectedAssignee = useMemo(
    () => (people.data ?? []).find((p) => p.id === assigneeId),
    [people.data, assigneeId],
  );

  // Search filter matching name, phone, email, and job title
  const filteredAssignees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return assignable;
    return assignable.filter((p) => {
      const nameMatch = p.full_name.toLowerCase().includes(q);
      const phoneMatch = p.phone ? p.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')) || p.phone.toLowerCase().includes(q) : false;
      const titleMatch = (p.job_title ?? '').toLowerCase().includes(q);
      const emailMatch = p.email.toLowerCase().includes(q);
      return nameMatch || phoneMatch || titleMatch || emailMatch;
    });
  }, [assignable, searchQuery]);

  // Calendar dates computation
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const days: { dateStr: string; dayNum: number; currentMonth: boolean; isPast: boolean }[] = [];
    const todayStr = toDateOnly(new Date());

    const prevMonthLast = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthLast - i;
      const prevDate = new Date(year, month - 1, d);
      const dateStr = toDateOnly(prevDate);
      days.push({ dateStr, dayNum: d, currentMonth: false, isPast: dateStr < todayStr });
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      const dateStr = toDateOnly(d);
      days.push({ dateStr, dayNum: i, currentMonth: true, isPast: dateStr < todayStr });
    }

    return days;
  }, [calendarMonth]);

  const changeMonth = (delta: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const formattedTime = `${String(selectedHour).padStart(2, '0')}:${selectedMinute} ${selectedPeriod}`;

  // Date / time pickers: the phone's own calendar and clock (Android dialogs, iOS sheet); a simple grid on web.
  const [iosPicker, setIosPicker] = useState<'date' | 'time' | null>(null);
  const dateValue = () => (due ? new Date(`${due}T12:00:00`) : new Date());
  const timeValue = () => {
    const d = dateValue();
    d.setHours((selectedHour % 12) + (selectedPeriod === 'PM' ? 12 : 0), Number(selectedMinute), 0, 0);
    return d;
  };
  const applyTime = (d: Date) => {
    const h = d.getHours();
    setSelectedPeriod(h >= 12 ? 'PM' : 'AM');
    setSelectedHour(h % 12 === 0 ? 12 : h % 12);
    setSelectedMinute(String(d.getMinutes()).padStart(2, '0'));
  };
  const openDate = () => {
    setPriorityDdlOpen(false);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ mode: 'date', value: dateValue(), minimumDate: new Date(), onValueChange: (_e, d) => setDue(toDateOnly(d)) });
    } else if (Platform.OS === 'ios') {
      setIosPicker('date');
    } else {
      setCalendarOpen(!calendarOpen);
      setTimeOpen(false);
    }
  };
  const openTime = () => {
    setPriorityDdlOpen(false);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ mode: 'time', value: timeValue(), is24Hour: false, onValueChange: (_e, d) => applyTime(d) });
    } else if (Platform.OS === 'ios') {
      setIosPicker('time');
    } else {
      setTimeOpen(!timeOpen);
      setCalendarOpen(false);
    }
  };

  // Employee guard: Employees only receive tasks, cannot assign them
  if (isEmployee) {
    return (
      <Screen header={<PageHeader title="Tasks" />}>
        <Card style={styles.restrictedCard}>
          <View style={styles.restrictedIconWrap}>
            <Ionicons name="shield-checkmark" size={38} color={colors.brand} />
          </View>
          <Text style={styles.restrictedTitle}>Task Assignment Restricted</Text>
          <Text style={styles.restrictedBody}>
            As an employee, your tasks are assigned directly by your Manager, HR, or the Boss. You do not need to assign tasks to others.
          </Text>
          <Button
            title="View My Tasks"
            icon="checkbox-outline"
            size="lg"
            onPress={() => router.replace('/tasks')}
            style={{ marginTop: spacing.md, width: '100%' }}
          />
        </Card>
      </Screen>
    );
  }

  const submit = async () => {
    setError(null);
    if (!assigneeId) return setError('Please choose who this task is assigned to.');
    if (title.trim().length < 3) return setError('Give the task a clear title (3+ characters).');

    setBusy(true);
    try {
      const timeNote = due ? `[Due by ${formattedTime}]\n\n` : '';
      const fullDescription = timeNote + description.trim();

      const id = await api.createTask({
        title: title.trim(),
        description: fullDescription,
        assignee: assigneeId,
        reviewer: me.id,
        priority,
        due,
        visibility: 'private',
        checklist: [],
      });

      toast('Task successfully assigned');
      router.replace(`/task/${id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const selectedPriorityObj = PRIORITY_OPTIONS.find((p) => p.value === priority)!;

  return (
    <>
      <Screen
        keyboard
        header={<PageHeader title="New Task" subtitle="Assign and schedule work for your team" />}
      footer={
        <Button
          title="Assign Task"
          icon="send"
          size="lg"
          loading={busy}
          disabled={!assigneeId || title.trim().length < 3}
          onPress={submit}
        />
      }>
      <View style={{ gap: spacing.lg }}>
        {error && <Banner tone="danger">{error}</Banner>}

        {/* ========================================================= */}
        {/* 1. TOP UPPER: ASSIGNEE SELECTOR (SEARCH BY NAME OR PHONE) */}
        {/* ========================================================= */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionBadgeIcon}>
              <Ionicons name="person-add-outline" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionHeaderTitle}>Assign To *</Text>
              <Text style={styles.sectionHeaderSubtitle}>Select the team member to execute this task</Text>
            </View>
          </View>

          {/* Selected Assignee Hero Box */}
          {selectedAssignee ? (
            <Pressable
              onPress={() => setAssigneeSearchOpen(true)}
              style={({ pressed }) => [
                styles.selectedAssigneeCard,
                pressed && { opacity: 0.9, backgroundColor: colors.brandSoft },
              ]}>
              <Avatar name={selectedAssignee.full_name} id={selectedAssignee.id} size={48} />
              <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                {/* Row 1: Name and Change button */}
                <View style={styles.assigneeTopRow}>
                  <Text style={styles.assigneeName} numberOfLines={1} ellipsizeMode="tail">
                    {selectedAssignee.full_name}
                  </Text>
                  <View style={styles.changeAssigneeBtn}>
                    <Ionicons name="swap-horizontal" size={13} color={colors.brand} />
                    <Text style={styles.changeAssigneeText}>Change</Text>
                  </View>
                </View>

                {/* Row 2: Role badge + Job title / department */}
                <View style={styles.assigneeMetaRow}>
                  <Badge
                    label={roleLabel[selectedAssignee.role]}
                    tone={selectedAssignee.role === 'boss' ? 'brand' : selectedAssignee.role === 'hr' ? 'info' : 'neutral'}
                  />
                  {Boolean(selectedAssignee.job_title || selectedAssignee.department) && (
                    <Text style={styles.assigneeSubtitle} numberOfLines={1} ellipsizeMode="tail">
                      {[selectedAssignee.job_title, selectedAssignee.department].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>

                {/* Row 3: Phone number */}
                {selectedAssignee.phone && (
                  <View style={styles.phoneTag}>
                    <Ionicons name="call-outline" size={12} color={colors.success} />
                    <Text style={styles.phoneTagText}>{selectedAssignee.phone}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setAssigneeSearchOpen(true)}
              style={styles.emptyAssigneeBox}>
              <Ionicons name="search-outline" size={20} color={colors.brand} />
              <Text style={styles.emptyAssigneeText}>
                Search person by name or phone number…
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </Card>

        {/* ========================================================= */}
        {/* 2. TITLE & DESCRIPTION */}
        {/* ========================================================= */}
        <Card style={styles.sectionCard}>
          <TextField
            label="Task title *"
            icon="document-text-outline"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Inspect fabric rolls on Loom #4"
          />
          <TextField
            label="Task description"
            icon="create-outline"
            value={description}
            onChangeText={setDescription}
            placeholder="Enter detailed task instructions, specifications, or notes…"
            multiline
            numberOfLines={4}
            style={{ minHeight: 100, textAlignVertical: 'top', paddingTop: 2 }}
          />
        </Card>

        {/* ========================================================= */}
        {/* 3. PRIORITY IN A CONNECTED DDL */}
        {/* ========================================================= */}
        <Card style={styles.sectionCard}>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Priority *</Text>
            <Pressable
              onPress={() => {
                setPriorityDdlOpen(!priorityDdlOpen);
                setCalendarOpen(false);
                setTimeOpen(false);
              }}
              style={[styles.ddlTrigger, priorityDdlOpen && styles.ddlTriggerActive]}>
              <Ionicons name={selectedPriorityObj.icon} size={18} color={selectedPriorityObj.color} />
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.ddlTriggerText}>{selectedPriorityObj.label}</Text>
                <Text style={styles.ddlTriggerSubtext}>— {selectedPriorityObj.sublabel}</Text>
              </View>
              <Ionicons name={priorityDdlOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>

            {priorityDdlOpen && (
              <View style={styles.ddlContainer}>
                {PRIORITY_OPTIONS.map((item, idx) => {
                  const active = item.value === priority;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => {
                        setPriority(item.value);
                        setPriorityDdlOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.ddlOption,
                        active && styles.ddlOptionActive,
                        pressed && styles.ddlOptionPressed,
                        idx < PRIORITY_OPTIONS.length - 1 && styles.ddlOptionBorder,
                      ]}>
                      <Ionicons name={item.icon} size={18} color={item.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ddlOptionTitle, active && { color: item.color, fontFamily: fonts.bold }]}>
                          {item.label}
                        </Text>
                        <Text style={styles.ddlOptionSubtitle}>{item.sublabel}</Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={18} color={item.color} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </Card>

        {/* ========================================================= */}
        {/* 4. DUE DATE & DUE TIME (COMPACT INPUTS + CONNECTED PICKERS) */}
        {/* ========================================================= */}
        <Card style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {/* Due date */}
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.fieldLabel}>Due date</Text>
              <Pressable
                onPress={openDate}
                accessibilityRole="button"
                accessibilityLabel="Choose due date"
                style={({ pressed }) => [styles.ddlTrigger, (calendarOpen || iosPicker === 'date') && styles.ddlTriggerActive, pressed && { opacity: 0.85 }]}>
                <Ionicons name="calendar-outline" size={18} color={due ? colors.brand : colors.textMuted} />
                <Text style={[styles.ddlTriggerText, !due && { color: colors.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>
                  {due ? formatDate(due) : 'Select date'}
                </Text>
                {due && (
                  <Pressable onPress={() => setDue(null)} hitSlop={10} accessibilityLabel="Clear due date">
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                )}
              </Pressable>
            </View>

            {/* Due time */}
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.fieldLabel}>Due time</Text>
              <Pressable
                onPress={openTime}
                disabled={!due}
                accessibilityRole="button"
                accessibilityLabel="Choose due time"
                style={({ pressed }) => [styles.ddlTrigger, (timeOpen || iosPicker === 'time') && styles.ddlTriggerActive, !due && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}>
                <Ionicons name="time-outline" size={18} color={due ? colors.brand : colors.textMuted} />
                <Text style={[styles.ddlTriggerText, { fontFamily: fonts.semibold }, !due && { color: colors.textMuted }]} numberOfLines={1}>
                  {formattedTime}
                </Text>
              </Pressable>
            </View>
          </View>
          {!due && <Text style={styles.dueHint}>Choose a date first, then the time it is due.</Text>}

          {/* Web: calendar in a centered dialog (phones use the native calendar) */}
          {Platform.OS === 'web' && (
            <PickerDialog visible={calendarOpen} title="Select due date" onClose={() => setCalendarOpen(false)} footer={<DialogButton label="Cancel" onPress={() => setCalendarOpen(false)} />}>
            <View>
              {/* Month Navigation */}
              <View style={styles.calMonthNav}>
                <Pressable onPress={() => changeMonth(-1)} hitSlop={8} style={styles.calNavBtn}>
                  <Ionicons name="chevron-back" size={18} color={colors.ink} />
                </Pressable>
                <Text style={styles.calMonthTitle}>
                  {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                </Text>
                <Pressable onPress={() => changeMonth(1)} hitSlop={8} style={styles.calNavBtn}>
                  <Ionicons name="chevron-forward" size={18} color={colors.ink} />
                </Pressable>
              </View>

              {/* Weekdays row */}
              <View style={styles.weekdaysRow}>
                {WEEKDAYS.map((w) => (
                  <Text key={w} style={styles.weekdayLabel}>{w}</Text>
                ))}
              </View>

              {/* Days grid */}
              <View style={styles.daysGrid}>
                {calendarDays.map((item, idx) => {
                  const isSelected = due === item.dateStr;
                  const isToday = item.dateStr === toDateOnly(new Date());

                  return (
                    <Pressable
                      key={idx}
                      disabled={item.isPast}
                      onPress={() => {
                        setDue(item.dateStr);
                        setCalendarOpen(false);
                      }}
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        isToday && !isSelected && styles.dayCellToday,
                        item.isPast && styles.dayCellPast,
                      ]}>
                      <Text
                        style={[
                          styles.dayText,
                          !item.currentMonth && styles.dayTextOtherMonth,
                          item.isPast && styles.dayTextPast,
                          isToday && !isSelected && styles.dayTextToday,
                          isSelected && styles.dayTextSelected,
                        ]}>
                        {item.dayNum}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            </PickerDialog>
          )}

          {/* Web: clock-face dialog (phones use the native clock) */}
          {Platform.OS === 'web' && (
            <TimeDialog
              visible={timeOpen}
              initial={{ hour: selectedHour, minute: Number(selectedMinute), period: selectedPeriod }}
              onCancel={() => setTimeOpen(false)}
              onConfirm={(v) => {
                setSelectedHour(v.hour);
                setSelectedMinute(String(v.minute).padStart(2, '0'));
                setSelectedPeriod(v.period);
                setTimeOpen(false);
              }}
            />
          )}
        </Card>

        {Platform.OS === 'ios' && (
          <Sheet visible={!!iosPicker} onClose={() => setIosPicker(null)} title={iosPicker === 'time' ? 'Due time' : 'Due date'}>
            {iosPicker && (
              <DateTimePicker
                value={iosPicker === 'date' ? dateValue() : timeValue()}
                mode={iosPicker}
                display={iosPicker === 'date' ? 'inline' : 'spinner'}
                minimumDate={iosPicker === 'date' ? new Date() : undefined}
                accentColor={colors.brand}
                themeVariant="light"
                onValueChange={(_e, d) => (iosPicker === 'date' ? setDue(toDateOnly(d)) : applyTime(d))}
              />
            )}
            <Button title="Done" size="lg" onPress={() => setIosPicker(null)} />
          </Sheet>
        )}
      </View>
    </Screen>

    {/* ========================================================= */}
    {/* MODAL SEARCH FOR ASSIGNEE BY NAME OR PHONE NUMBER */}
    {/* ========================================================= */}
    <Modal
      visible={assigneeSearchOpen}
      animationType="slide"
      onRequestClose={() => setAssigneeSearchOpen(false)}>
      <View style={[styles.modalRoot, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>Choose Assignee</Text>
            <Text style={styles.modalSubtitle}>Search through {assignable.length} team members</Text>
          </View>
          <Pressable
            onPress={() => setAssigneeSearchOpen(false)}
            hitSlop={10}
            accessibilityLabel="Close"
            style={styles.modalCloseBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Search Input Bar */}
        <View style={styles.modalSearchPadding}>
          <View style={styles.searchBarWrap}>
            <Ionicons name="search-outline" size={20} color={colors.brand} />
            <TextInput
              autoFocus
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by name or phone number…"
              placeholderTextColor={colors.textMuted}
              style={styles.searchBarInput}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Results List: FlatList has its own virtualization, NOT inside ScrollView */}
        <FlatList
          data={filteredAssignees}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.modalListContent}
          ListEmptyComponent={
            <Card style={{ margin: spacing.lg }}>
              <EmptyState
                icon="people-outline"
                title="No matching person"
                body="Try searching with a different name or phone number digits."
              />
            </Card>
          }
          renderItem={({ item }) => {
            const active = item.id === assigneeId;
            return (
              <Pressable
                onPress={() => {
                  setAssigneeId(item.id);
                  setAssigneeSearchOpen(false);
                  setSearchQuery('');
                }}
                style={({ pressed }) => [
                  styles.assigneeListRow,
                  active && styles.assigneeListRowActive,
                  pressed && { backgroundColor: colors.surfaceAlt },
                ]}>
                <Avatar name={item.full_name} id={item.id} size={42} />
                <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                  <View style={styles.assigneeListTopRow}>
                    <Text
                      style={[styles.assigneeRowName, active && { color: colors.brand }]}
                      numberOfLines={1}
                      ellipsizeMode="tail">
                      {item.full_name}
                    </Text>
                    <Badge
                      label={roleLabel[item.role]}
                      tone={item.role === 'boss' ? 'brand' : item.role === 'hr' ? 'info' : 'neutral'}
                    />
                  </View>
                  <Text style={styles.assigneeRowSub} numberOfLines={1} ellipsizeMode="tail">
                    {[item.job_title, item.department].filter(Boolean).join(' · ')}
                  </Text>
                  {item.phone && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Ionicons name="call-outline" size={12} color={colors.success} />
                      <Text style={styles.assigneeRowPhone}>{item.phone}</Text>
                    </View>
                  )}
                </View>
                {active && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  </>
  );
}

const styles = StyleSheet.create({
  dueHint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: spacing.sm },
  restrictedCard: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  restrictedIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  restrictedTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
  },
  restrictedBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionCard: {
    gap: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  sectionHeaderSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.text,
    marginBottom: 4,
  },
  selectedAssigneeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.brandTint,
  },
  assigneeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  assigneeName: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  assigneeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  assigneeSubtitle: {
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  phoneTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  phoneTagText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.success,
  },
  changeAssigneeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandTint,
  },
  changeAssigneeText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.brand,
  },
  emptyAssigneeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  emptyAssigneeText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brand,
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
  pickerAttachedCard: {
    marginTop: 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.md,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipActive: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  quickChipText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  quickChipTextActive: {
    fontFamily: fonts.bold,
    color: colors.brand,
  },
  clearDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
  },
  clearDateText: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    color: colors.danger,
  },
  calMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  weekdayLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.textMuted,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    marginVertical: 2,
  },
  dayCellSelected: {
    backgroundColor: colors.brand,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
  dayCellPast: {
    opacity: 0.35,
  },
  dayText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text,
  },
  dayTextOtherMonth: {
    color: colors.textMuted,
  },
  dayTextPast: {
    color: colors.textMuted,
  },
  dayTextToday: {
    fontFamily: fonts.bold,
    color: colors.brand,
  },
  dayTextSelected: {
    fontFamily: fonts.bold,
    color: colors.white,
  },
  periodRow: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    padding: 3,
    alignSelf: 'center',
  },
  periodBtn: {
    paddingVertical: 6,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
  },
  periodBtnActive: {
    backgroundColor: colors.brand,
  },
  periodBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  periodBtnTextActive: {
    color: colors.white,
  },
  clockSubhead: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  hoursGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  clockNumCell: {
    width: 44,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  clockNumCellActive: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  clockNumText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
  },
  clockNumTextActive: {
    fontFamily: fonts.bold,
    color: colors.brand,
  },
  minutesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  minuteCell: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  minuteCellActive: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  minuteText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text,
  },
  minuteTextActive: {
    fontFamily: fonts.bold,
    color: colors.brand,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  searchBarInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  assigneeListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  assigneeListRowActive: {
    backgroundColor: colors.brandSoft,
  },
  assigneeListTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  assigneeRowName: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: colors.text,
  },
  assigneeRowSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  assigneeRowPhone: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.success,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  modalTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.text,
  },
  modalSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: spacing.xs,
    borderRadius: radius.pill,
  },
  modalSearchPadding: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  modalListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
