import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '../auth/SessionProvider';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { AppButton } from '../components/AppButton';
import { calendarDay, shiftDate, type CalendarMode } from './commuteCalendar';
import { useCalendarOverrides, saveCalendarDay, searchCalendar } from './calendarClient';
import { dayModeLabels, formatTime } from '../commute/commuteModel';
import { CAMPUS_POINTS, localDateAt, weekdayForDate } from '../mvp/settings';
import { useRideRequests, sendRideRequest } from '../mvp/rideRequestClient';
import type { CalendarSearchResult } from './calendarMatching';
import { useHomeClock } from '../rides/useHomeClock';
import { colors, radii, spacing } from '../theme';

const labels: Record<CalendarMode, string> = {
  ...dayModeLabels,
  off: 'No commute',
};
const time = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
export function CommuteCalendarScreen({ initialDate }: { initialDate?: string } = {}) {
  const { user, profile, commute } = useSession();
  const { now } = useHomeClock();
  const today = localDateAt(now.getTime() / 1000);
  const [selected, setSelected] = useState(initialDate ?? today);
  const [month, setMonth] = useState((initialDate ?? today).slice(0, 7));
  const overrides = useCalendarOverrides(user?.id);
  const requests = useRideRequests(user?.id);
  const [searchResult, setResult] = useState<CalendarSearchResult | null>(null);
  const [resultKey, setResultKey] = useState('');
  const basis = JSON.stringify([selected, commute, overrides.days]);
  const result = resultKey === basis ? searchResult : null;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const day =
    commute && profile
      ? calendarDay(commute, profile.role, selected, overrides.days[selected])
      : null;
  const accepted = requests.items.find((r) => r.localDate === selected && r.status === 'ACCEPTED');
  const withinHorizon = selected >= today && selected <= shiftDate(today, 30);
  const daysInMonth = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
  ).getUTCDate();
  const offset = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(
    weekdayForDate(`${month}-01`),
  );
  useEffect(() => {
    generation.current++;
  }, [basis]);
  const changeDay = async (mode: CalendarMode | 'default') => {
    setBusy(true);
    setMessage(null);
    generation.current++;
    setResult(null);
    try {
      await saveCalendarDay(selected, mode);
      setMessage('Saved for this date. Your weekly schedule stays the same.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save this date.');
    } finally {
      setBusy(false);
    }
  };
  const search = async () => {
    const requestGeneration = ++generation.current;
    setBusy(true);
    setMessage(null);
    setResult(null);
    setResultKey(basis);
    try {
      const next = await searchCalendar(selected);
      if (generation.current === requestGeneration) setResult(next);
    } catch (e) {
      if (generation.current === requestGeneration)
        setMessage(e instanceof Error ? e.message : 'Search unavailable.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      eyebrow="YOUR COMMUTE"
      title={`Hi, ${profile?.firstName ?? 'there'}`}
      subtitle="Your usual week, with room for a different day."
    >
      {!commute ? (
        <Card>
          <Text>Save your usual commute to fill your calendar.</Text>
          <AppButton label="Set up my commute" onPress={() => router.push('/commute-setup')} />
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heading}>
                  {commute.startArea.label} →{' '}
                  {CAMPUS_POINTS.find((p) => p.id === commute.campusLot)?.label ?? 'Campus'}
                </Text>
                <Text style={styles.muted}>Repeats weekly until you edit it</Text>
              </View>
              <Pressable
                accessibilityLabel="Edit weekly commute"
                onPress={() => router.push('/commute-setup')}
                hitSlop={10}
              >
                <Ionicons name="create-outline" size={24} color={colors.accent} />
              </Pressable>
            </View>
            <View style={styles.row}>
              {commute.days.map((d) => (
                <View key={d.day} style={styles.weekChip}>
                  <Text style={styles.heading}>
                    {d.day.slice(0, 1).toUpperCase() + d.day.slice(1)}
                  </Text>
                  <Text style={styles.muted}>
                    {profile?.role === 'driver'
                      ? 'Driving'
                      : profile?.role === 'rider'
                        ? 'Riding'
                        : dayModeLabels[d.mode]}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
          <Card>
            <View style={styles.row}>
              <AppButton
                label="‹"
                variant="secondary"
                onPress={() => setMonth(shiftDate(`${month}-01`, -1).slice(0, 7))}
              />
              <Text style={styles.heading}>
                {new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </Text>
              <AppButton
                label="›"
                variant="secondary"
                onPress={() => setMonth(shiftDate(`${month}-${daysInMonth}`, 1).slice(0, 7))}
              />
            </View>
            <View style={styles.grid}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) => (
                <View key={i} style={styles.cell}>
                  <Text style={styles.muted}>{label}</Text>
                </View>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <View key={`blank-${i}`} style={styles.cell} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const date = `${month}-${String(i + 1).padStart(2, '0')}`;
                const mode = profile
                  ? calendarDay(commute, profile.role, date, overrides.days[date])?.mode
                  : null;
                const booked = requests.items.some(
                  (r) => r.localDate === date && r.status === 'ACCEPTED',
                );
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={`${date}, ${booked ? 'accepted ride' : mode ? labels[mode] : 'no commute'}${overrides.days[date] ? ', date exception' : ''}`}
                    accessibilityState={{ selected: selected === date }}
                    onPress={() => {
                      setSelected(date);
                      setMessage(null);
                    }}
                    style={[styles.cell, selected === date && styles.selected]}
                  >
                    <Text
                      style={[styles.dateNumber, selected === date && { color: colors.accent }]}
                    >
                      {i + 1}
                    </Text>
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
                    {overrides.days[date] && <Text style={styles.exception}>•</Text>}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.muted}>
              Car: driving · Person: riding · Arrows: either · Dot: changed date
            </Text>
          </Card>
          <Card>
            <Text style={styles.heading}>
              {new Date(`${selected}T12:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}{' '}
              ·{' '}
              {accepted
                ? accepted.driverId === user?.id
                  ? 'Driving'
                  : 'Riding'
                : day
                  ? labels[day.mode]
                  : 'No commute'}
            </Text>
            <Text style={styles.muted}>
              {overrides.days[selected]
                ? 'Changed for this date only'
                : 'From your saved weekly commute'}
            </Text>
            {accepted ? (
              <Text>
                Agreed pickup {time(accepted.plan.pickup)} · campus{' '}
                {time(accepted.plan.riderDestinationArrival)} · New York time
              </Text>
            ) : day?.arriveBy !== null && day?.arriveBy !== undefined ? (
              <Text>Arrive on campus by {formatTime(day.arriveBy)} · New York time</Text>
            ) : null}
            {accepted ? (
              <>
                <Text style={{ color: colors.success }}>
                  Accepted ride with{' '}
                  {accepted.driverId === user?.id ? accepted.riderName : accepted.driverName}. Your
                  accepted role and timing stay fixed.
                </Text>
                <AppButton label="View accepted ride" onPress={() => router.navigate('/rides')} />
              </>
            ) : (
              <>
                <Text>
                  {commute.days.some((d) => d.day === weekdayForDate(selected))
                    ? 'Change your role for this date:'
                    : 'Add a date using your first saved day’s times:'}
                </Text>
                <View style={styles.row}>
                  {(['drive', 'ride', 'either', 'off'] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      accessibilityRole="button"
                      disabled={
                        busy ||
                        !withinHorizon ||
                        !overrides.loaded ||
                        !requests.loaded ||
                        ((mode === 'drive' || mode === 'either') && !commute.seats)
                      }
                      onPress={() => void changeDay(mode)}
                      style={[styles.modeChip, day?.mode === mode && styles.selected]}
                    >
                      <Text>{labels[mode]}</Text>
                    </Pressable>
                  ))}
                </View>
                {!commute.seats && (
                  <Text style={styles.muted}>
                    To offer a ride, update your account role and save passenger seats in your
                    weekly commute.
                  </Text>
                )}
                {overrides.days[selected] && (
                  <AppButton
                    label="Use weekly default"
                    variant="secondary"
                    disabled={busy || !withinHorizon}
                    onPress={() => void changeDay('default')}
                  />
                )}
                {!withinHorizon && (
                  <Text>
                    View any month. Edit and match dates within the next 30 days for this demo.
                  </Text>
                )}
                {day?.mode === 'either' && (
                  <Text>
                    You’ll see potential drivers and passengers. Accepting one ride fixes your role
                    for this date.
                  </Text>
                )}
                {!commute.startPoint || !commute.discoveryEnabled ? (
                  <>
                    <Text>
                      {!commute.startPoint
                        ? 'Confirm your private starting point to get real road estimates.'
                        : 'Matching is turned off in your commute settings.'}
                    </Text>
                    <AppButton
                      label="Review commute setup"
                      variant="secondary"
                      onPress={() => router.push('/commute-setup')}
                    />
                  </>
                ) : (
                  <AppButton
                    label={
                      busy
                        ? 'Working…'
                        : day?.mode === 'drive'
                          ? 'Find passengers'
                          : day?.mode === 'either'
                            ? 'Find drivers and passengers'
                            : 'Find drivers'
                    }
                    disabled={
                      busy ||
                      !withinHorizon ||
                      !day ||
                      day.arriveBy === null ||
                      !overrides.loaded ||
                      !requests.loaded
                    }
                    onPress={() => void search()}
                  />
                )}
              </>
            )}
          </Card>
        </>
      )}
      {(message || overrides.error || requests.error) && (
        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          {message || overrides.error || requests.error}
        </Text>
      )}
      {result && (
        <>
          {result.incomplete && (
            <Card>
              <Text style={{ color: colors.warning }}>
                Incomplete search: this public-routing demo checks at most two accounts and two
                driver/rider arrangements. Other matches may exist.
              </Text>
            </Card>
          )}
          <Text style={styles.heading}>Potential matches</Text>
          <Text style={styles.muted}>
            Suggested pickup times use saved arrival deadlines, not confirmed availability. Sending
            a request proposes these times; the driver decides. No seats are reserved until
            acceptance.
          </Text>
          {result.matches.map((match) => {
            const request = requests.items.find(
              (r) =>
                r.driverId === match.driverId &&
                r.riderId === match.riderId &&
                r.localDate === selected,
            );
            return (
              <Card key={`${match.driverId}:${match.riderId}`}>
                <Text style={styles.heading}>
                  {match.name} · {match.role === 'driver' ? 'Driving' : 'Looking for a ride'}
                </Text>
                <Text>{match.area.label} · approximate area</Text>
                <Text>
                  Proposed pickup {time(match.plan.pickup)} · campus{' '}
                  {time(match.plan.riderDestinationArrival)}
                </Text>
                <Text>
                  Adds {Math.ceil(match.addedDrivingSeconds / 60)} minutes driving, including
                  boarding
                </Text>
                {request ? (
                  <Text>{request.status}</Text>
                ) : match.riderId === user?.id ? (
                  <AppButton
                    label="Request this trip"
                    disabled={busy}
                    onPress={() => {
                      setBusy(true);
                      setMessage(null);
                      void sendRideRequest({
                        source: 'CALENDAR',
                        proposedPlan: {
                          departure: match.plan.departure,
                          pickup: match.plan.pickup,
                          vehicleCampusArrival: match.plan.vehicleCampusArrival,
                        },
                        driverId: match.driverId,
                        localDate: selected,
                        direction: 'TO_CAMPUS',
                        riderRevision: match.riderRevision,
                        driverRevision: match.driverRevision,
                      })
                        .then(() =>
                          setMessage('Request sent. Follow the driver’s decision in Rides.'),
                        )
                        .catch((e: Error) => setMessage(e.message))
                        .finally(() => setBusy(false));
                    }}
                  />
                ) : (
                  <Text>
                    The rider can find your driver listing and send a request. Review incoming
                    requests in Rides.
                  </Text>
                )}
              </Card>
            );
          })}
          {!result.matches.length && (
            <Text>No potential matches found in the checked accounts.</Text>
          )}
          {result.unknownCount > 0 && (
            <Text>
              Road estimates or confirmed locations were unavailable for {result.unknownCount}{' '}
              candidate(s). Retry later.
            </Text>
          )}
        </>
      )}
      <AppButton
        label="Rides and requests"
        variant="secondary"
        onPress={() => router.navigate('/rides')}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  heading: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { color: colors.textMuted, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  weekChip: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: '14.2857%',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  selected: { backgroundColor: colors.accentSoft },
  dateNumber: { fontSize: 16, color: colors.text, fontWeight: '600' },
  modeChip: {
    padding: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  exception: { color: colors.accent, position: 'absolute', bottom: 0 },
});
