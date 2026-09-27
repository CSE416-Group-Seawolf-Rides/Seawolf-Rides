import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { DetailRow } from '../components/DetailRow';
import { SavedCommuteCard } from '../components/SavedCommuteCard';
import { SetUpCommuteCard } from '../components/SetUpCommuteCard';
import { Screen } from '../components/Screen';
import { rideSearchFixture } from '../prototypeData/fixtures';
import { colors, radii, spacing } from '../theme';

interface MatchScreenProps {
  onFindCommuters: () => void;
  onSetUpCommute?: () => void;
}

export function MatchScreen({ onFindCommuters, onSetUpCommute }: MatchScreenProps) {
  return (
    <Screen
      eyebrow="FIND A RIDE"
      subtitle="Find a commute that fits your schedule."
      title="Seawolf Rides"
    >
      {onSetUpCommute && <SetUpCommuteCard onPress={onSetUpCommute} />}
      <Card>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>Ride search</Text>
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>DEMO</Text>
          </View>
        </View>

        <View style={styles.routeBlock}>
          <View style={styles.locationRow}>
            <View style={styles.originDot} />
            <DetailRow label="Starting area" value={rideSearchFixture.startingArea} />
          </View>
          <View style={styles.routeLine} />
          <View style={styles.locationRow}>
            <View style={styles.destinationDot} />
            <DetailRow label="Destination" value={rideSearchFixture.destination} />
          </View>
        </View>

        <View style={styles.scheduleGrid}>
          <View style={styles.gridItem}>
            <DetailRow label="Day" value={rideSearchFixture.day} />
          </View>
          <View style={styles.gridItem}>
            <DetailRow label="Arrival target" value={rideSearchFixture.arrivalTarget} />
          </View>
        </View>
        <DetailRow
          label="Schedule flexibility"
          value={rideSearchFixture.scheduleFlexibility}
        />

        <View style={styles.buttonSpacing}>
          <AppButton label="Find commuters" onPress={onFindCommuters} />
        </View>
        <Text style={styles.demoNote}>
          Search inputs and recommendations are local M2 prototype data.
        </Text>
      </Card>

      <SavedCommuteCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  demoBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  demoBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  routeBlock: {
    marginBottom: spacing.xl,
  },
  locationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  originDot: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: 3,
    height: 15,
    width: 15,
  },
  destinationDot: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 15,
    width: 15,
  },
  routeLine: {
    backgroundColor: colors.border,
    height: 26,
    marginLeft: 7,
    marginVertical: spacing.xs,
    width: 2,
  },
  scheduleGrid: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  gridItem: {
    flex: 1,
  },
  buttonSpacing: {
    marginTop: spacing.xl,
  },
  demoNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
