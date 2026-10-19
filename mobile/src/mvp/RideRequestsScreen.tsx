import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { useCalendarOverrides } from '../calendar/calendarClient';
import { shiftDate } from '../calendar/commuteCalendar';
import { useHomeClock } from '../rides/useHomeClock';
import { colors, radii, spacing } from '../theme';
import { useRideRequests } from './rideRequestClient';
import {
  currentCarpools,
  localToday,
  partnerId,
  requestNeedsAnswer,
  rideEnd,
  rideHistory,
  startOfWeek,
  weekAgenda,
} from './ridePresentation';
import { LiveCarpoolCard } from './components/LiveCarpoolCard';
import { useRideDecision } from './useRideDecision';
import { LiveAgenda } from './components/LiveAgenda';
import { GasShares } from '../payments/components/GasShares';
import { useSettlements } from '../payments/paymentsClient';
import { computeBalances, coveredThisMonth } from '../payments/tally';

export function RideRequestsScreen() {
  const { user, profile, commute } = useSession();
  const requests = useRideRequests(user?.id);
  const decision = useRideDecision();
  const overrides = useCalendarOverrides(user?.id);
  const { now } = useHomeClock(
    requests.items.map((r) => (r.status === 'ACCEPTED' ? rideEnd(r) : r.plan.departure)),
  );
  const epoch = now.getTime() / 1000;
  const uid = user?.id ?? '';
  const [showNextWeek, setShowNextWeek] = useState(false);
  const settlements = useSettlements(user?.id);
  const carpools = currentCarpools(requests.items, uid, epoch);
  const waiting = requests.items.filter((r) => requestNeedsAnswer(r, uid, epoch));
  const waitingPeople = new Set(waiting.map((r) => partnerId(r, uid))).size;
  const monday = startOfWeek(localToday(epoch));
  const thisWeek = weekAgenda(
    requests.items,
    uid,
    epoch,
    monday,
    commute,
    profile?.role ?? 'rider',
    overrides.days,
  );
  const nextWeek = weekAgenda(
    requests.items,
    uid,
    epoch,
    shiftDate(monday, 7),
    commute,
    profile?.role ?? 'rider',
    overrides.days,
  );
  const today = localToday(epoch);
  const balances = computeBalances(uid, requests.items, settlements.items, today, shiftDate(monday, 6));
  const covered = coveredThisMonth(uid, settlements.items, today.slice(0, 7));
  const history = rideHistory(requests.items, uid, epoch);
  const past = history.filter((r) => r.status === 'ACCEPTED');
  const people = new Set(past.map((r) => partnerId(r, uid))).size;
  if (requests.error)
    return (
      <Screen title="Rides" afterContent={decision.sheet}>
        <Text accessibilityRole="alert">{requests.error}</Text>
        <AppButton label="Reload rides" onPress={requests.retry} />
      </Screen>
    );
  return (
    <Screen title="Rides" afterContent={decision.sheet}>
      {decision.error && <Text accessibilityRole="alert">{decision.error}</Text>}
      {!requests.loaded && <Text style={styles.muted}>Loading your rides…</Text>}
      {(requests.error || overrides.error) && (
        <Text accessibilityRole="alert">{requests.error || overrides.error}</Text>
      )}
      {requests.error && <AppButton label="Reload rides" onPress={requests.retry} />}
      {!!waiting.length && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/rides/requests')}
          style={styles.waiting}
        >
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{waitingPeople}</Text>
          </View>
          <Text style={styles.waitingCopy}>
            {waitingPeople} {waitingPeople === 1 ? 'person is' : 'people are'} waiting on your
            answer
          </Text>
          <Text style={styles.action}>Review</Text>
        </Pressable>
      )}
      <GasShares balances={balances} coveredCents={covered} uid={uid} />
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>
          Your carpools
        </Text>
        {carpools.map((pool) => (
          <LiveCarpoolCard
            key={pool.id}
            carpool={pool}
            uid={uid}
            onOpen={() => router.push(`/rides/person/${pool.id}`)}
            onCancel={(request) => void decision.cancel(request)}
            busyId={decision.busy}
          />
        ))}
        {requests.loaded && !carpools.length && (
          <Card style={styles.empty}>
            <Text style={styles.muted}>
              No upcoming carpools yet. People you have accepted trips with will appear here.
            </Text>
            <AppButton
              label={
                profile?.role === 'driver'
                  ? 'Find passengers'
                  : profile?.role === 'rider'
                    ? 'Find drivers'
                    : 'Find matches'
              }
              variant="secondary"
              onPress={() => router.navigate('/home')}
            />
          </Card>
        )}
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>
          This week
        </Text>
        {thisWeek.length ? (
          <LiveAgenda days={thisWeek} uid={uid} />
        ) : requests.loaded && overrides.loaded ? (
          <Card>
            <Text style={styles.muted}>Nothing left on your schedule this week.</Text>
          </Card>
        ) : (
          <Text style={styles.muted}>Loading your week…</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showNextWeek }}
          onPress={() => setShowNextWeek((v) => !v)}
          style={styles.disclosure}
        >
          <Text style={styles.heading}>Next week</Text>
          <Text style={styles.muted}>
            {nextWeek.length} trip{nextWeek.length === 1 ? '' : 's'}
          </Text>
          <Ionicons
            name={showNextWeek ? 'chevron-up' : 'chevron-down'}
            color={colors.textMuted}
            size={18}
          />
        </Pressable>
        {showNextWeek &&
          (nextWeek.length ? (
            <LiveAgenda days={nextWeek} uid={uid} />
          ) : (
            <Card>
              <Text style={styles.muted}>No trips planned next week.</Text>
            </Card>
          ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open history, ${past.length} past rides with ${people} people`}
        onPress={() => router.push('/rides/history')}
      >
        <Card style={styles.history}>
          <View style={styles.historyHeader}>
            <Text style={styles.heading}>History</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
          <Text style={styles.stats}>
            {past.length} past ride{past.length === 1 ? '' : 's'} · {people}{' '}
            {people === 1 ? 'person' : 'people'}
          </Text>
          <Text style={styles.muted}>Past rides and closed requests</Text>
        </Card>
      </Pressable>
    </Screen>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing.md },
  heading: { fontSize: 20, fontWeight: '800', color: colors.text },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  action: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
  },
  waitingCopy: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 21,
  },
  badge: {
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
  badgeText: { color: colors.surface, fontWeight: '800' },
  empty: { gap: spacing.md },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  history: { gap: spacing.sm, padding: spacing.xl },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stats: { fontSize: 18, fontWeight: '700', color: colors.text },
});
