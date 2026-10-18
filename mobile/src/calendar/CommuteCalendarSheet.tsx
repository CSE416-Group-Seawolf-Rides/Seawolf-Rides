import { useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { dayModeLabels, formatTime, type CommuteSchedule } from '../commute/commuteModel';
import type { CommuteRole } from '../onboarding/onboardingModel';
import type { RideRequest } from '../mvp/rideRequestModel';
import { weekdayForDate } from '../mvp/settings';
import {
  calendarDay,
  shiftDate,
  type CalendarMode,
  type DayOverride,
} from './commuteCalendar';
import { saveCalendarDay } from './calendarClient';
import { colors, radii, spacing } from '../theme';

const labels: Record<CalendarMode, string> = { ...dayModeLabels, off: 'No commute' };
export function CommuteCalendarSheet({
  initialDate,
  today,
  commute,
  role,
  uid,
  overrides,
  requests,
  ready,
  onClose,
  onSelect,
  onEditCommute,
}: {
  initialDate: string;
  today: string;
  commute: CommuteSchedule;
  role: CommuteRole;
  uid: string;
  overrides: Record<string, DayOverride>;
  requests: RideRequest[];
  ready: boolean;
  onClose: () => void;
  onSelect: (date: string) => void;
  onEditCommute: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const afterDismiss = useRef(onClose);
  const didDismiss = useRef(false);
  const [date, setDate] = useState(initialDate);
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [pendingMode, setPendingMode] = useState<CalendarMode | 'default' | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const accepted = requests.find((r) => r.localDate === date && r.status === 'ACCEPTED');
  const day = calendarDay(
    commute,
    role,
    date,
    pendingMode === null
      ? overrides[date]
      : pendingMode === 'default'
        ? null
        : { mode: pendingMode },
  );
  const savedDay = calendarDay(commute, role, date, overrides[date]);
  const canEdit =
    !accepted && date >= today && date <= shiftDate(today, 30) && ready && !busy;
  const daysInMonth = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
  ).getUTCDate();
  const offset = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(
    weekdayForDate(`${month}-01`),
  );
  const finishDismiss = () => {
    if (didDismiss.current) return;
    didDismiss.current = true;
    afterDismiss.current();
  };
  const dismiss = (action: () => void) => {
    if (busy || !visible) return;
    afterDismiss.current = action;
    if (Platform.OS === 'ios') setVisible(false);
    else finishDismiss();
  };
  const close = () => dismiss(onClose);
  const save = async () => {
    if (pendingMode === null || !canEdit) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveCalendarDay(date, pendingMode);
      setPendingMode(null);
      setMessage('Saved for this date. Your usual week stays the same.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this date.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      onDismiss={finishDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close calendar"
          accessibilityRole="button"
          onPress={close}
          style={styles.backdrop}
          disabled={busy}
        />
        <SafeAreaView
          edges={['bottom', 'left', 'right']}
          style={styles.sheet}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Your calendar
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close calendar"
              onPress={close}
              disabled={busy}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.row}>
              <Pressable
                accessibilityLabel="Previous month"
                accessibilityRole="button"
                disabled={busy}
                onPress={() => setMonth(shiftDate(`${month}-01`, -1).slice(0, 7))}
                style={styles.iconButton}
              >
                <Ionicons name="chevron-back" size={22} color={colors.accent} />
              </Pressable>
              <Text style={styles.heading}>
                {new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </Text>
              <Pressable
                accessibilityLabel="Next month"
                accessibilityRole="button"
                disabled={busy}
                onPress={() =>
                  setMonth(shiftDate(`${month}-${daysInMonth}`, 1).slice(0, 7))
                }
                style={styles.iconButton}
              >
                <Ionicons name="chevron-forward" size={22} color={colors.accent} />
              </Pressable>
            </View>
            <View style={styles.grid}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) => (
                <View key={i} style={styles.weekday}>
                  <Text style={styles.muted}>{label}</Text>
                </View>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <View key={`blank-${i}`} style={styles.cell} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const value = `${month}-${String(i + 1).padStart(2, '0')}`;
                const scheduled = calendarDay(commute, role, value, overrides[value]);
                const booked = requests.find(
                  (r) => r.localDate === value && r.status === 'ACCEPTED',
                );
                const mode = booked
                  ? booked.driverId === uid
                    ? 'drive'
                    : 'ride'
                  : scheduled?.mode;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: value === date, disabled: busy }}
                    accessibilityLabel={`${value}, ${booked ? 'accepted ride' : mode ? labels[mode] : 'no commute'}${overrides[value] ? ', date exception' : ''}`}
                    disabled={busy}
                    onPress={() => {
                      setDate(value);
                      setPendingMode(null);
                      setMessage(null);
                    }}
                    style={[styles.cell, value === date && styles.selected]}
                  >
                    <Text style={styles.number}>{i + 1}</Text>
                    {mode && (
                      <Ionicons
                        size={14}
                        color={booked ? colors.success : colors.accent}
                        name={
                          booked
                            ? 'checkmark-circle'
                            : mode === 'drive'
                              ? 'car-outline'
                              : mode === 'ride'
                                ? 'person-outline'
                                : 'swap-horizontal-outline'
                        }
                      />
                    )}
                    {overrides[value] && <View style={styles.dot} />}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.legend}>
              Car: driving · Person: riding · Arrows: either · Dot: changed date
            </Text>
            <Card style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={[styles.heading, styles.dayTitle]}>
                  {new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}{' '}
                  ·{' '}
                  {accepted
                    ? accepted.driverId === uid
                      ? 'Driving'
                      : 'Riding'
                    : day
                      ? labels[day.mode]
                      : 'No commute'}
                </Text>
                {pendingMode !== null && (
                  <Text accessibilityLiveRegion="polite" style={styles.unsaved}>
                    Unsaved
                  </Text>
                )}
              </View>
              {accepted ? (
                <>
                  <Text>
                    Accepted ride with{' '}
                    {accepted.driverId === uid ? accepted.riderName : accepted.driverName}
                    .
                  </Text>
                  <Text style={styles.muted}>
                    Role and timing are confirmed. This calendar cannot change an accepted
                    ride.
                  </Text>
                </>
              ) : (
                <>
                  {day?.startAt != null && (
                    <Text>
                      {day.mode === 'drive' ? 'Leave at' : 'Ready from'}{' '}
                      {formatTime(day.startAt)}
                    </Text>
                  )}
                  {day?.arriveBy != null && (
                    <Text>Arrive by {formatTime(day.arriveBy)} · New York time</Text>
                  )}
                  {!commute.days.some((d) => d.day === weekdayForDate(date)) && (
                    <Text style={styles.muted}>
                      Adding a date uses your first saved day’s times.
                    </Text>
                  )}
                  <View style={styles.modes}>
                    {(['drive', 'ride', 'either', 'off'] as const).map((mode) => {
                      const disabled =
                        !canEdit ||
                        ((mode === 'drive' || mode === 'either') && !commute.seats);
                      return (
                        <Pressable
                          key={mode}
                          accessibilityRole="radio"
                          accessibilityState={{
                            checked: (day?.mode ?? 'off') === mode,
                            selected: (day?.mode ?? 'off') === mode,
                            disabled,
                          }}
                          disabled={disabled}
                          onPress={() => {
                            setPendingMode(
                              mode === (savedDay?.mode ?? 'off') ? null : mode,
                            );
                            setMessage(null);
                          }}
                          style={[
                            styles.mode,
                            (day?.mode ?? 'off') === mode && styles.modeSelected,
                            disabled && styles.disabled,
                          ]}
                        >
                          <Ionicons
                            name={
                              (day?.mode ?? 'off') === mode
                                ? 'checkmark-circle'
                                : 'ellipse-outline'
                            }
                            size={18}
                            color={
                              (day?.mode ?? 'off') === mode
                                ? colors.surface
                                : colors.textMuted
                            }
                          />
                          <Text
                            style={[
                              styles.modeLabel,
                              (day?.mode ?? 'off') === mode && styles.modeLabelSelected,
                            ]}
                          >
                            {labels[mode]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {!commute.seats && (
                    <Text style={styles.muted}>
                      Save passenger seats in your usual commute before offering a ride.
                    </Text>
                  )}
                  <View style={styles.dayActions}>
                    {(overrides[date] || pendingMode !== null) && (
                      <AppButton
                        label="Use weekly default"
                        variant="secondary"
                        disabled={!canEdit}
                        onPress={() => setPendingMode('default')}
                      />
                    )}
                    {!ready && (
                      <Text style={styles.muted}>
                        Loading your saved calendar and rides…
                      </Text>
                    )}
                    {(date < today || date > shiftDate(today, 30)) && (
                      <Text style={styles.muted}>
                        Edit and match dates within the next 30 days.
                      </Text>
                    )}
                    {pendingMode !== null && (
                      <AppButton
                        label={busy ? 'Saving…' : 'Save this date'}
                        disabled={!canEdit}
                        onPress={() => void save()}
                      />
                    )}
                  </View>
                </>
              )}
              {message && (
                <Text accessibilityLiveRegion="polite" style={styles.muted}>
                  {message}
                </Text>
              )}
            </Card>
            <AppButton
              label="Edit my usual commute"
              variant="secondary"
              disabled={busy}
              onPress={() => dismiss(onEditCommute)}
            />
          </ScrollView>
          <View style={styles.footer}>
            <AppButton
              label="View this day"
              disabled={busy || (!accepted && pendingMode !== null) || !ready}
              onPress={() => dismiss(() => onSelect(date))}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,33,43,0.4)' },
  backdrop: { flex: 1 },
  sheet: {
    height: '90%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: 24, color: colors.text, fontWeight: '800' },
  heading: { fontSize: 16, color: colors.text, fontWeight: '700' },
  iconButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: '14.2857%',
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cell: {
    width: '14.2857%',
    minHeight: 52,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  selected: { backgroundColor: colors.accentSoft },
  number: { fontSize: 16, fontWeight: '600', color: colors.text },
  dot: {
    position: 'absolute',
    bottom: 2,
    right: 8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  muted: { color: colors.textMuted, lineHeight: 20 },
  legend: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  dayCard: { padding: spacing.xl, gap: spacing.lg },
  dayHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dayTitle: { flex: 1, lineHeight: 24 },
  unsaved: {
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 12,
    fontWeight: '800',
  },
  dayActions: { gap: spacing.lg, marginTop: spacing.sm },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    minHeight: 52,
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  modeSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeLabel: { color: colors.text, fontWeight: '700', flexShrink: 1 },
  modeLabelSelected: { color: colors.surface },
  disabled: { opacity: 0.45 },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
