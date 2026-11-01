import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { friendlyRideError } from '../mvp/rideErrors';
import { RideDayDirections } from './RideDayDirections';
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
import { CommuteMatchesSheet } from './CommuteMatchesSheet';
import { dayModeLabels, formatTime, type Weekday } from '../commute/commuteModel';
import { localDateAt, weekdayForDate } from '../mvp/settings';
import { useRideRequests, sendRideRequest, cancelRideRequest } from '../mvp/rideRequestClient';
import {
  mergeCalendarPages,
  type CalendarMatch,
  type CalendarSearchResult,
} from './calendarMatching';
import { useVehicle } from '../vehicle/vehicleClient';
import { VehicleRequiredSheet } from '../vehicle/VehicleRequiredSheet';
import { useHomeClock } from '../rides/useHomeClock';
import { homeHeaderDate, partnerName, requestNeedsAnswer, rideEnd } from '../mvp/ridePresentation';
import type { RideRequest } from '../mvp/rideRequestModel';
import { TRAFFIC_ESTIMATE_MAX_AGE_SECONDS } from '../routing/types';
import { colors, radii, spacing } from '../theme';

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
  const requests = useRideRequests(user?.id);
  const [searchResult, setResult] = useState<CalendarSearchResult | null>(null);
  const { now, greeting } = useHomeClock([
    ...requests.items.map((r) => (r.status === 'ACCEPTED' ? rideEnd(r) : r.plan.departure)),
    ...(searchResult?.matches.flatMap((m) =>
      m.eta?.model === 'TRAFFIC_FORECAST'
        ? [m.eta.computedAtEpochSeconds + TRAFFIC_ESTIMATE_MAX_AGE_SECONDS]
        : [],
    ) ?? []),
  ]);
  const today = localDateAt(now.getTime() / 1000);
  const [selected, setSelected] = useState(initialDate ?? today);
  const [direction, setDirection] = useState<'TO_CAMPUS' | 'FROM_CAMPUS'>('TO_CAMPUS');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const overrides = useCalendarOverrides(user?.id);
  const vehicle = useVehicle(user?.id);
  const [vehicleRequired, setVehicleRequired] = useState(false);
  const [resultKey, setResultKey] = useState('');
  const basis = JSON.stringify([selected, direction, commute, overrides.days]);
  const result = resultKey === basis ? searchResult : null;
  const [busy, setBusy] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const day =
    commute && profile
      ? calendarDay(commute, profile.role, selected, overrides.days[selected])
      : null;
  const acceptedRides = requests.items.filter(
    (r) => r.localDate === selected && (r.direction ?? 'TO_CAMPUS') === direction && r.status === 'ACCEPTED',
  );
  const accepted = acceptedRides[0];
  const isDriver = (day?.mode === 'drive' || (day?.mode === 'either' && (commute?.seats ?? 0) > 0)) || (accepted && accepted.driverId === user?.id);
  const seatsCapacity = commute?.seats ?? 1;
  const seatsFilled = isDriver ? acceptedRides.reduce((sum, r) => sum + (r.seats || 1), 0) : acceptedRides.length;
  const seatsRemaining = isDriver ? Math.max(0, seatsCapacity - seatsFilled) : (acceptedRides.length > 0 ? 0 : 1);
  const nextTrip = nextAcceptedRide(requests.items, now.getTime() / 1000);
  const nextScheduled =
    commute && profile
      ? nextScheduledCommute(commute, profile.role, today, overrides.days, now.getTime() / 1000)
      : null;
  const needsDecision = requests.items.filter((r) =>
    requestNeedsAnswer(r, user?.id ?? '', now.getTime() / 1000),
  );
  const pendingForDay = requests.items.filter(
    (r) => r.status === 'PENDING' && r.localDate === selected && (r.direction ?? 'TO_CAMPUS') === direction,
  );
  const week =
    commute && profile && user
      ? calendarWeek(commute, profile.role, selected, overrides.days, requests.items, user.id)
      : [];
  const withinHorizon = selected >= today && selected <= shiftDate(today, 30);
  const chooseDate = (date: string) => {
    generation.current++;
    setSelected(date);
    setMessage(null);
    setCalendarOpen(false);
    setMatchesOpen(false);
  };
  // An agenda link may revisit the already-mounted Home tab with a different date.
  useFocusEffect(
    useCallback(() => {
      if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
        generation.current++;
        setSelected(initialDate);
        setMessage(null);
        router.setParams({ date: undefined });
      }
    }, [initialDate]),
  );
  const search = async (date = selected, more = false, dir = direction) => {
    if (busy) return;
    const previous = more ? result : null;
    if (more && !previous?.nextCursor) return;
    if (date !== selected) chooseDate(date);
    const requestGeneration = ++generation.current;
    setMatchesOpen(true);
    setBusy(true);
    setMessage(null);
    if (!more) setResult(null);
    setResultKey(JSON.stringify([date, dir, commute, overrides.days]));
    try {
      let combined = await searchCalendar(date, previous?.nextCursor ?? undefined, dir);
      if (previous) {
        combined = mergeCalendarPages(previous, combined);
      } else {
        // Automatically fetch initial candidates so all top matches appear together
        // rather than the single "best match first" quirk.
        while (combined.nextCursor && combined.matches.length < 5) {
          // Pause briefly between pages to stay cleanly within the local demo routing cooldown
          await new Promise((resolve) => setTimeout(resolve, 1200));
          const next = await searchCalendar(date, combined.nextCursor, dir);
          combined = mergeCalendarPages(combined, next);
        }
      }
      if (generation.current === requestGeneration) setResult(combined);
    } catch (error) {
      if (generation.current === requestGeneration) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'functions/aborted'
        )
          setResult(null);
        setMessage(error instanceof Error ? error.message : 'Search unavailable.');
      }
    } finally {
      setBusy(false);
    }
  };
  const requestMatch = async (match: CalendarMatch) => {
    if (busy) return;
    setBusy(true);
    setRequesting(true);
    setMessage(null);
    try {
      const request = await sendRideRequest({
        source: 'CALENDAR',
        proposedPlan: {
          departure: match.plan.departure,
          pickup: match.plan.pickup,
          vehicleCampusArrival: match.plan.vehicleCampusArrival,
        },
        driverId: match.driverId,
        riderId: match.riderId,
        localDate: selected,
        direction: match.direction ?? direction,
        riderRevision: match.riderRevision,
        driverRevision: match.driverRevision,
      });
      return request;
    } catch (error) {
      const copy = friendlyRideError(error, 'request', match.name);
      Alert.alert(copy.title, copy.message);
    } finally {
      setBusy(false);
      setRequesting(false);
      setCancellingId(null);
    }
  };
  const cancelMatch = async (request: RideRequest) => {
    if (busy) return;
    setCancellingId(request.id);
    setBusy(true);
    setRequesting(true);
    setMessage(null);
    try {
      await cancelRideRequest(request);
      setMessage('Request cancelled.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not cancel this request.');
    } finally {
      setBusy(false);
      setRequesting(false);
      setCancellingId(null);
    }
  };
  return (
    <Screen
      eyebrow={homeHeaderDate(today).toUpperCase()}
      title={`${greeting}, ${profile?.firstName ?? 'there'}`}
      afterContent={
        <>
          <VehicleRequiredSheet
            visible={vehicleRequired}
            onClose={() => setVehicleRequired(false)}
          />
          {matchesOpen && commute?.startPoint && day && user && (
            <CommuteMatchesSheet
              date={selected}
              mode={day.mode}
              uid={user.id}
              ownPoint={commute.startPoint}
              result={result}
              busy={busy}
              nowEpochSeconds={now.getTime() / 1000}
              requesting={requesting}
              cancellingId={cancellingId}
              message={message}
              requests={requests.items}
              onLoadMore={() => void search(selected, true)}
              onRetry={() => void search()}
              vehicleLoaded={vehicle.loaded}
              vehicleReady={!!vehicle.vehicle}
              onVehicleRequired={() => {
                setMatchesOpen(false);
                setVehicleRequired(true);
              }}
              onCancel={(request) => void cancelMatch(request)}
              onRequest={requestMatch}
              onClose={() => setMatchesOpen(false)}
              onReviewRequests={() => {
                setMatchesOpen(false);
                router.push('/rides/requests');
              }}
            />
          )}
          {calendarOpen && commute && profile && user ? (
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
          ) : undefined}
        </>
      }
    >
      {!commute ? (
        <Card style={styles.nextTrip}>
          <Text style={styles.nextEyebrow}>Your Next Trip</Text>
          <Text style={styles.nextDetail}>No trip planned yet.</Text>
          <Text style={styles.nextDetail}>
            Save your usual commute to see your week and find matches.
          </Text>
          <AppButton
            variant="secondary"
            label="Set up my commute"
            onPress={() => router.push('/commute-setup')}
          />
        </Card>
      ) : (
        <>
          {nextTrip ? (
            <Card style={styles.nextTrip}>
              <Text style={styles.nextEyebrow}>
                YOUR NEXT TRIP · {dateLabel(nextTrip.localDate)}{nextTrip.direction === 'FROM_CAMPUS' ? ' · RETURN' : ''}
              </Text>
              <Text style={styles.nextHeadline}>
                {nextTrip.driverId === user?.id
                  ? `${time(nextTrip.plan.departure)} departure`
                  : `${time(nextTrip.plan.pickup)} pickup`}
              </Text>
              <Text style={styles.nextDetail}>
                With{' '}
                {nextTrip.driverId === user?.id
                  ? requests.items
                      .filter(
                        (r) =>
                          r.localDate === nextTrip.localDate &&
                          r.status === 'ACCEPTED' &&
                          r.driverId === user?.id,
                      )
                      .map((r) => r.riderName)
                      .join(', ')
                  : nextTrip.driverName}{' '}
                · {nextTrip.campusLabel}
              </Text>
              <Text style={styles.nextDetail}>
                {nextTrip.direction === 'FROM_CAMPUS'
                  ? `Drop-off arrival ${time(nextTrip.plan.riderDestinationArrival)} · New York time`
                  : `Campus arrival ${time(nextTrip.plan.riderDestinationArrival)} · New York time`}
              </Text>
              {nextTrip.localDate === today && user && (
                <RideDayDirections ride={nextTrip} uid={user.id} />
              )}
              <AppButton
                label="View ride"
                variant="secondary"
                onPress={() => router.push(`/rides/${nextTrip.id}`)}
              />
            </Card>
          ) : (
            <Card style={styles.nextTrip}>
              <Text style={styles.nextEyebrow}>Your Next Trip</Text>
              {nextScheduled ? (
                <>
                  <Text style={styles.nextHeadline}>
                    {dateLabel(nextScheduled.date)} · {dayModeLabels[nextScheduled.day.mode]}
                  </Text>
                  <Text style={styles.nextDetail}>
                    {nextScheduled.day.startAt != null
                      ? `${nextScheduled.day.mode === 'drive' ? 'Leave at' : 'Ready from'} ${formatTime(nextScheduled.day.startAt)} · `
                      : ''}
                    Arrive by {formatTime(nextScheduled.day.arriveBy!)} · New York time
                  </Text>
                  <Text style={styles.nextDetail}>
                    {nextScheduled.day.mode === 'drive'
                      ? 'No passenger confirmed yet.'
                      : nextScheduled.day.mode === 'ride'
                        ? 'No driver confirmed yet.'
                        : 'No ride confirmed yet. You can drive or ride.'}
                  </Text>
                  {nextScheduled.day.startAt == null && (
                    <Text style={styles.nextDetail}>
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
                    <Text style={[styles.calendarText, styles.nextDetail]}>
                      {busy ? 'Finding matches…' : 'Find matches'}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.accentSoft} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.nextDetail}>
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
              <Text style={styles.heading}>Weekly View</Text>
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
            <View style={styles.weekNavigation}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous week"
                style={styles.weekArrow}
                onPress={() => chooseDate(shiftDate(selected, -7))}
              >
                <Ionicons name="chevron-back" size={21} color={colors.text} />
              </Pressable>
              <Text style={styles.monthTitle}>
                {new Date(`${week[0]?.date ?? selected}T12:00:00Z`).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next week"
                style={styles.weekArrow}
                onPress={() => chooseDate(shiftDate(selected, 7))}
              >
                <Ionicons name="chevron-forward" size={21} color={colors.text} />
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
              today={week.some((d) => d.date === today) ? weekdayForDate(today) : undefined}
              showModes
              actionableDays={week.map((d) => d.day)}
              selectedDay={week.find((d) => d.date === selected)?.day}
              onPressDay={(weekday) => {
                const date = week.find((d) => d.day === weekday)?.date;
                if (date) chooseDate(date);
              }}
            />
            {(!requests.loaded || !overrides.loaded) && (
              <Text style={styles.muted}>Loading your saved week…</Text>
            )}
          </Card>
          {needsDecision.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.heading}>Needs you</Text>
              <Card style={styles.needsYou}>
                <Text style={styles.heading}>
                  {needsDecision.length} ride request
                  {needsDecision.length === 1 ? '' : 's'} to review
                </Text>
                <Text>
                  {needsDecision
                    .slice(0, 3)
                    .map((r) => `${partnerName(r, user?.id ?? '')} · ${dateLabel(r.localDate)}`)
                    .join('\n')}
                </Text>
                <AppButton
                  label={`Review ${needsDecision.length} request${needsDecision.length === 1 ? '' : 's'}`}
                  variant="secondary"
                  onPress={() => router.push('/rides/requests')}
                />
              </Card>
            </View>
          )}
          <View style={styles.section}>
            <Text style={styles.heading}>
              {accepted
                ? `Your selected ${direction === 'FROM_CAMPUS' ? 'return ' : ''}trip`
                : 'Find commuters'}
            </Text>
            <Card style={styles.searchCard}>
              <View style={styles.row}>
                <Text style={styles.searchDate}>{dateLabel(selected)}</Text>
                <Pressable
                  accessibilityLabel="Choose another date"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setCalendarOpen(true)}
                >
                  <Ionicons name="calendar-outline" size={22} color={colors.accent} />
                </Pressable>
              </View>
              <View style={styles.directionToggleContainer}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Morning trip to campus"
                  style={[styles.directionTab, direction === 'TO_CAMPUS' && styles.directionTabActive]}
                  onPress={() => {
                    setDirection('TO_CAMPUS');
                    setResult(null);
                  }}
                >
                  <Ionicons
                    name={direction === 'TO_CAMPUS' ? 'sunny' : 'sunny-outline'}
                    size={18}
                    color={direction === 'TO_CAMPUS' ? colors.accent : colors.textMuted}
                  />
                  <View style={styles.directionTabContent}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.directionTabTitle,
                        direction === 'TO_CAMPUS' && styles.directionTabTitleActive,
                      ]}
                    >
                      To Campus
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.directionTabSubtitle,
                        direction === 'TO_CAMPUS' && styles.directionTabSubtitleActive,
                      ]}
                    >
                      Morning
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Evening return trip home"
                  style={[styles.directionTab, direction === 'FROM_CAMPUS' && styles.directionTabActive]}
                  onPress={() => {
                    setDirection('FROM_CAMPUS');
                    setResult(null);
                  }}
                >
                  <Ionicons
                    name={direction === 'FROM_CAMPUS' ? 'moon' : 'moon-outline'}
                    size={17}
                    color={direction === 'FROM_CAMPUS' ? colors.accent : colors.textMuted}
                  />
                  <View style={styles.directionTabContent}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.directionTabTitle,
                        direction === 'FROM_CAMPUS' && styles.directionTabTitleActive,
                      ]}
                    >
                      Return Home
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.directionTabSubtitle,
                        direction === 'FROM_CAMPUS' && styles.directionTabSubtitleActive,
                      ]}
                    >
                      Evening
                    </Text>
                  </View>
                </Pressable>
              </View>
              <Text style={styles.searchRole}>
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
                    {accepted.driverId === user?.id
                      ? `Accepted with ${acceptedRides.map((r) => r.riderName).join(', ')}`
                      : `Accepted with ${accepted.driverName}`}
                  </Text>
                  {isDriver && (
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      {seatsRemaining > 0
                        ? `${seatsFilled} of ${seatsCapacity} seats filled · ${seatsRemaining} seat${seatsRemaining === 1 ? '' : 's'} available`
                        : `Car full (${seatsFilled} of ${seatsCapacity} seats filled)`}
                    </Text>
                  )}
                  <Text>
                    Departure {time(accepted.plan.departure)} ·{' '}
                    {direction === 'FROM_CAMPUS'
                      ? `drop-off ${time(accepted.plan.riderDestinationArrival)}`
                      : `campus ${time(accepted.plan.riderDestinationArrival)}`}
                  </Text>
                  <AppButton
                    label={acceptedRides.length > 1 ? `View ${acceptedRides.length} accepted rides` : 'View accepted ride'}
                    onPress={() => router.push(`/rides/${accepted.id}`)}
                  />
                  {isDriver && seatsRemaining > 0 && (
                    <AppButton
                      label={busy ? 'Finding matches…' : 'Find matches'}
                      variant="secondary"
                      disabled={busy || !withinHorizon || !overrides.loaded || !requests.loaded}
                      onPress={() => void search()}
                    />
                  )}
                </>
              ) : (
                <>
                  {direction === 'TO_CAMPUS' ? (
                    day?.arriveBy != null && (
                      <Text style={styles.searchDetail}>
                        Arrive on campus around {formatTime(day.arriveBy)} · New York time
                      </Text>
                    )
                  ) : (
                    day?.leaveAt != null && (
                      <Text style={styles.searchDetail}>
                        Leave campus around {formatTime(day.leaveAt)} · New York time
                      </Text>
                    )
                  )}
                  {pendingForDay.length > 0 && (
                    <Text style={styles.muted}>
                      {pendingForDay.length} pending request
                      {pendingForDay.length === 1 ? '' : 's'} for this date. Follow decisions in
                      Rides.
                    </Text>
                  )}
                  {!day || (direction === 'FROM_CAMPUS' ? day.leaveAt === null : day.arriveBy === null) ? (
                    <>
                      <Text style={styles.muted}>
                        {direction === 'FROM_CAMPUS'
                          ? 'No return trip from campus is scheduled for this date. Update your commute to include an evening departure time.'
                          : 'No trip to campus is saved for this date. Use the calendar to choose another day or adjust this date.'}
                      </Text>
                      <AppButton
                        label={direction === 'FROM_CAMPUS' ? 'Edit commute schedule' : 'Open calendar'}
                        variant="secondary"
                        onPress={() => direction === 'FROM_CAMPUS' ? router.push('/commute-setup') : setCalendarOpen(true)}
                      />
                    </>
                  ) : !commute.startPoint || !commute.discoveryEnabled || (direction === 'TO_CAMPUS' && day.startAt == null) ? (
                    <>
                      <Text style={styles.muted}>
                        {!commute.startPoint
                          ? 'Confirm your private starting point to get road estimates.'
                          : day?.startAt == null
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
                        label={busy ? 'Finding matches…' : 'Find matches'}
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
          Some ride records could not be loaded. Your trip list may be incomplete.
        </Text>
      )}
      {(message || overrides.error || requests.error) && (
        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          {message || overrides.error || requests.error}
        </Text>
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
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  weekArrow: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  needsYou: {
    borderColor: colors.accent,
    borderWidth: 1.5,
    gap: spacing.md,
    padding: spacing.xl,
  },
  searchCard: { gap: spacing.lg, padding: spacing.xl },
  directionToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: radii.md,
    padding: 3,
    gap: 4,
  },
  directionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
  directionTabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  directionTabContent: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  directionTabTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 16,
  },
  directionTabTitleActive: {
    color: colors.text,
    fontWeight: '800',
  },
  directionTabSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    lineHeight: 14,
  },
  directionTabSubtitleActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  searchDate: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
  searchRole: {
    alignSelf: 'flex-start',
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    fontWeight: '700',
  },
  searchDetail: { fontSize: 15, lineHeight: 23, color: colors.textMuted },
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  calendarText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  nextTrip: { backgroundColor: colors.accent },
  nextEyebrow: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  nextHeadline: { color: colors.surface, fontSize: 28, fontWeight: '800' },
  nextDetail: { color: colors.accentSoft, lineHeight: 21, fontSize: 15 },
});
