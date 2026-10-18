import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '../auth/SessionProvider';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { AppButton } from '../components/AppButton';
import { WeekStrip } from '../rides/components/WeekStrip';
import { calendarDay, shiftDate } from './commuteCalendar';
import { useCalendarOverrides, searchCalendar } from './calendarClient';
import { calendarWeek, nextAcceptedRide, nextScheduledCommute } from './calendarHome';
import { CommuteCalendarSheet } from './CommuteCalendarSheet';
import { dayModeLabels, formatTime, type Weekday } from '../commute/commuteModel';
import { localDateAt, weekdayForDate } from '../mvp/settings';
import { useRideRequests, sendRideRequest } from '../mvp/rideRequestClient';
import type { CalendarSearchResult } from './calendarMatching';
import { useHomeClock } from '../rides/useHomeClock';
import { colors, spacing } from '../theme';

const time = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
export function CommuteCalendarScreen({ initialDate }: { initialDate?: string } = {}) {
  const { user, profile, commute } = useSession();
  const { now, greeting } = useHomeClock();
  const today = localDateAt(now.getTime() / 1000);
  const [selected, setSelected] = useState(initialDate ?? today);
  const [calendarOpen, setCalendarOpen] = useState(false);
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
  const nextTrip = nextAcceptedRide(requests.items, now.getTime() / 1000);
  const nextScheduled =
    commute && profile
      ? nextScheduledCommute(commute, profile.role, today, overrides.days, now.getTime() / 1000)
      : null;
  const needsDecision = requests.items.filter(
    (r) =>
      r.status === 'PENDING' && r.driverId === user?.id && r.plan.departure > now.getTime() / 1000,
  );
  const pendingForDay = requests.items.filter(
    (r) => r.status === 'PENDING' && r.localDate === selected,
  );
  const week =
    commute && profile && user
      ? calendarWeek(commute, profile.role, today, overrides.days, requests.items, user.id)
      : [];
  const confirmedCount = week.filter((d) => d.status === 'confirmed').length;
  const commuteCount = week.filter((d) => d.status !== 'off').length;
  const withinHorizon = selected >= today && selected <= shiftDate(today, 30);
  const chooseDate = (date: string) => {
    generation.current++;
    setSelected(date);
    setMessage(null);
    setCalendarOpen(false);
  };
  const search = async (date = selected) => {
    if (date !== selected) chooseDate(date);
    const requestGeneration = ++generation.current;
    setBusy(true);
    setMessage(null);
    setResult(null);
    setResultKey(JSON.stringify([date, commute, overrides.days]));
    try {
      const next = await searchCalendar(date);
      if (generation.current === requestGeneration) setResult(next);
    } catch (error) {
      if (generation.current === requestGeneration)
        setMessage(error instanceof Error ? error.message : 'Search unavailable.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      eyebrow={dateLabel(today).toUpperCase()}
      title={`${greeting}, ${profile?.firstName ?? 'there'}`}
      afterContent={
        calendarOpen && commute && profile && user ? (
          <CommuteCalendarSheet
            initialDate={selected}
            today={today}
            commute={commute}
            role={profile.role}
            uid={user.id}
            overrides={overrides.days}
            requests={requests.items}
            ready={overrides.loaded && requests.loaded}
            onClose={() => setCalendarOpen(false)}
            onSelect={chooseDate}
            onEditCommute={() => {
              setCalendarOpen(false);
              router.push('/commute-setup');
            }}
          />
        ) : undefined
      }
    >
      {!commute ? (
        <Card>
          <Text style={styles.heading}>Your Next Trip</Text>
          <Text style={styles.muted}>No trip planned yet.</Text>
          <Text>Save your usual commute to see your week and find matches.</Text>
          <AppButton label="Set up my commute" onPress={() => router.push('/commute-setup')} />
        </Card>
      ) : (
        <>
          {nextTrip ? (
            <Card style={styles.nextTrip}>
              <Text style={styles.nextEyebrow}>
                YOUR NEXT TRIP ·{' '}
                {dateLabel(nextTrip.localDate)}
              </Text>
              <Text style={styles.nextHeadline}>
                {nextTrip.driverId === user?.id
                  ? `${time(nextTrip.plan.departure)} departure`
                  : `${time(nextTrip.plan.pickup)} pickup`}
              </Text>
              <Text style={styles.nextDetail}>
                With {nextTrip.driverId === user?.id ? nextTrip.riderName : nextTrip.driverName} ·{' '}
                {nextTrip.campusLabel}
              </Text>
              <Text style={styles.nextDetail}>
                Campus arrival {time(nextTrip.plan.riderDestinationArrival)} · New York time
              </Text>
              <AppButton
                label="View ride"
                variant="secondary"
                onPress={() => router.navigate('/rides')}
              />
            </Card>
          ) : (
            <Card>
              <Text style={styles.heading}>Your Next Trip</Text>
              {nextScheduled ? (
                <>
                  <Text style={styles.heading}>
                    {dateLabel(nextScheduled.date)} · {dayModeLabels[nextScheduled.day.mode]}
                  </Text>
                  <Text>
                    {nextScheduled.day.startAt != null
                      ? `${nextScheduled.day.mode === 'drive' ? 'Leave at' : 'Ready from'} ${formatTime(nextScheduled.day.startAt)} · `
                      : ''}
                    Arrive by {formatTime(nextScheduled.day.arriveBy!)} · New York time
                  </Text>
                  <Text style={styles.muted}>
                    {nextScheduled.day.mode === 'drive'
                      ? 'No passenger confirmed yet.'
                      : nextScheduled.day.mode === 'ride'
                        ? 'No driver confirmed yet.'
                        : 'No ride confirmed yet. You can drive or ride.'}
                  </Text>
                  {nextScheduled.day.startAt == null && (
                    <Text style={styles.muted}>
                      Add your morning start time in your usual commute before matching.
                    </Text>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || !requests.loaded || !overrides.loaded}
                    style={styles.calendarButton}
                    onPress={() => {
                      if (
                        !commute.startPoint ||
                        !commute.discoveryEnabled ||
                        nextScheduled.day.startAt == null
                      ) {
                        router.push('/commute-setup');
                        return;
                      }
                      void search(nextScheduled.date);
                    }}
                  >
                    <Text style={styles.calendarText}>
                      {busy
                        ? 'Finding matches…'
                        : nextScheduled.day.mode === 'drive'
                          ? 'Find passengers'
                          : nextScheduled.day.mode === 'ride'
                            ? 'Find drivers'
                            : 'Find drivers or passengers'}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.accent} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.muted}>
                    No trip to campus is planned in the next 30 days.
                  </Text>
                  <AppButton
                    label="Choose a day"
                    variant="secondary"
                    onPress={() => setCalendarOpen(true)}
                  />
                </>
              )}
            </Card>
          )}
          <Card>
            <View style={styles.row}>
              <Text style={styles.heading}>This week</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Calendar View"
                onPress={() => setCalendarOpen(true)}
                style={styles.calendarButton}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                <Text style={styles.calendarText}>Calendar View</Text>
              </Pressable>
            </View>
            <WeekStrip
              overview={week}
              dates={
                Object.fromEntries(week.map((d) => [d.day, Number(d.date.slice(-2))])) as Record<
                  Weekday,
                  number
                >
              }
              today={weekdayForDate(today)}
              showModes
              actionableDays={week.map((d) => d.day)}
              selectedDay={week.find((d) => d.date === selected)?.day}
              onPressDay={(weekday) => {
                const date = week.find((d) => d.day === weekday)?.date;
                if (date) chooseDate(date);
              }}
            />
            <Text style={styles.muted}>
              {requests.loaded && overrides.loaded
                ? `${confirmedCount} of ${commuteCount} trips to campus confirmed`
                : 'Loading your saved week…'}
            </Text>
          </Card>
          {needsDecision.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.heading}>Needs you</Text>
              <Card>
                <Text style={styles.heading}>
                  {needsDecision.length} ride request{needsDecision.length === 1 ? '' : 's'} to
                  review
                </Text>
                <Text>
                  {needsDecision
                    .slice(0, 3)
                    .map((r) => `${r.riderName} · ${dateLabel(r.localDate)}`)
                    .join('\n')}
                </Text>
                <AppButton
                  label="Review requests"
                  variant="secondary"
                  onPress={() => router.navigate('/rides')}
                />
              </Card>
            </View>
          )}
          <View style={styles.section}>
            <Text style={styles.heading}>
              {accepted
                ? 'Your selected trip'
                : day?.mode === 'drive'
                  ? 'Find passengers'
                  : day?.mode === 'either'
                    ? 'Find drivers and passengers'
                    : 'Find a driver'}
            </Text>
            <Card>
              <View style={styles.row}>
                <Text style={styles.heading}>{dateLabel(selected)}</Text>
                <Pressable
                  accessibilityLabel="Choose another date"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setCalendarOpen(true)}
                >
                  <Ionicons name="calendar-outline" size={22} color={colors.accent} />
                </Pressable>
              </View>
              <Text>
                {accepted
                  ? accepted.driverId === user?.id
                    ? 'Driving'
                    : 'Riding'
                  : day
                    ? dayModeLabels[day.mode]
                    : 'No commute scheduled'}
              </Text>
              {accepted ? (
                <>
                  <Text style={{ color: colors.success }}>
                    Accepted with{' '}
                    {accepted.driverId === user?.id ? accepted.riderName : accepted.driverName}
                  </Text>
                  <Text>
                    Pickup {time(accepted.plan.pickup)} · campus{' '}
                    {time(accepted.plan.riderDestinationArrival)}
                  </Text>
                  <AppButton label="View accepted ride" onPress={() => router.navigate('/rides')} />
                </>
              ) : (
                <>
                  {day?.arriveBy != null && (
                    <Text>Arrive on campus by {formatTime(day.arriveBy)} · New York time</Text>
                  )}
                  {pendingForDay.length > 0 && (
                    <Text style={styles.muted}>
                      {pendingForDay.length} pending request{pendingForDay.length === 1 ? '' : 's'}{' '}
                      for this date. Follow decisions in Rides.
                    </Text>
                  )}
                  {!day || day.arriveBy === null ? (
                    <>
                      <Text style={styles.muted}>
                        No trip to campus is saved for this date. Use the calendar to choose another
                        day or adjust this date.
                      </Text>
                      <AppButton
                        label="Open calendar"
                        variant="secondary"
                        onPress={() => setCalendarOpen(true)}
                      />
                    </>
                  ) : !commute.startPoint || !commute.discoveryEnabled || day.startAt == null ? (
                    <>
                      <Text style={styles.muted}>
                        {!commute.startPoint
                          ? 'Confirm your private starting point to get road estimates.'
                          : day.startAt == null
                            ? 'Add your morning start time in your usual commute before matching.'
                            : 'Matching is turned off in your commute settings.'}
                      </Text>
                      <AppButton
                        label="Review my commute"
                        variant="secondary"
                        onPress={() => router.push('/commute-setup')}
                      />
                    </>
                  ) : (
                    <>
                      {day.mode === 'either' && (
                        <Text style={styles.muted}>
                          See drivers and passengers. Your role is confirmed when a ride is
                          accepted.
                        </Text>
                      )}
                      {!withinHorizon && (
                        <Text style={styles.muted}>Search dates within the next 30 days.</Text>
                      )}
                      <AppButton
                        label={
                          busy
                            ? 'Finding matches…'
                            : day.mode === 'drive'
                              ? 'Find passengers'
                              : day.mode === 'either'
                                ? 'Find matches'
                                : 'Find drivers'
                        }
                        disabled={busy || !withinHorizon || !overrides.loaded || !requests.loaded}
                        onPress={() => void search()}
                      />
                    </>
                  )}
                </>
              )}
            </Card>
          </View>
        </>
      )}
      {requests.truncated && (
        <Text style={styles.muted}>
          Only 100 ride records are loaded. Your trip list and weekly totals may be incomplete.
        </Text>
      )}
      {(message || overrides.error || requests.error) && (
        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          {message || overrides.error || requests.error}
        </Text>
      )}
      {result && !accepted && (
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
              Commute timing, locations or road estimates were incomplete for {result.unknownCount}{' '}
              candidate(s). Retry later.
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  heading: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { color: colors.textMuted, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  section: { gap: spacing.md },
  calendarButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  calendarText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  nextTrip: { backgroundColor: colors.accent },
  nextEyebrow: { color: colors.accentSoft, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  nextHeadline: { color: colors.surface, fontSize: 28, fontWeight: '800' },
  nextDetail: { color: colors.accentSoft, lineHeight: 21, fontSize: 15 },
});
