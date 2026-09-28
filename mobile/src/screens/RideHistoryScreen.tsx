import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { formatTime, lotTitle } from '../commute/commuteModel';
import { StatusPill } from '../rides/components/StatusPill';
import { PastTrip } from '../rides/rideModel';
import { colors, radii, spacing } from '../theme';

export interface PastTripView extends PastTrip {
  dateLabel: string;
}

interface RideHistoryScreenProps {
  trips: PastTripView[];
  onBack: () => void;
}

const outcomeCopy: Record<PastTrip['outcome'], { label: string; tone: 'success' | 'neutral' | 'warning' }> = {
  completed: { label: 'Completed', tone: 'success' },
  skipped: { label: 'You skipped', tone: 'neutral' },
  cancelled: { label: 'Driver cancelled', tone: 'warning' },
};

export function RideHistoryScreen({ trips, onBack }: RideHistoryScreenProps) {
  return (
    <Screen onBack={onBack} title="History">
      {trips.length === 0 ? (
        <Text style={styles.empty}>Your finished trips will show up here.</Text>
      ) : (
        <View style={styles.group}>
          {trips.map((trip, index) => {
            const outcome = outcomeCopy[trip.outcome];
            return (
              <View
                accessibilityLabel={`${trip.dateLabel}, ${trip.kind === 'ride' ? 'ride with' : 'drove'} ${trip.withName}, ${outcome.label}`}
                accessible
                key={trip.id}
                style={[styles.row, index < trips.length - 1 && styles.divider]}
              >
                <View style={styles.copy}>
                  <Text style={styles.date}>{trip.dateLabel}</Text>
                  <Text style={styles.title}>
                    {trip.kind === 'ride' ? `Ride with ${trip.withName}` : `Drove ${trip.withName}`}
                  </Text>
                  <Text style={styles.meta}>
                    {trip.outcome === 'completed'
                      ? `Arrived ${formatTime(trip.arrivedAt)} · ${lotTitle(trip.campusLot)}`
                      : lotTitle(trip.campusLot)}
                  </Text>
                </View>
                <StatusPill label={outcome.label} tone={outcome.tone} />
              </View>
            );
          })}
        </View>
      )}
      <Text style={styles.note}>Demo history: past trips are sample data.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  divider: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  date: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  note: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
