import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { SetUpCommuteCard } from '../components/SetUpCommuteCard';
import { AgendaList } from '../rides/components/AgendaList';
import { CarpoolCard } from '../rides/components/CarpoolCard';
import { Carpool, UpcomingItem } from '../rides/rideModel';
import { colors, radii, spacing } from '../theme';

export interface HistorySummary {
  shared: number;
  skipped: number;
  people: number;
}

interface RidesScreenProps {
  hasCommute: boolean;
  waitingOnYou: number;
  carpools: Carpool[];
  thisWeek: UpcomingItem[];
  nextWeek: UpcomingItem[];
  history: HistorySummary | null;
  onReviewRequests: () => void;
  onOpenCarpool: (carpool: Carpool) => void;
  onWithdraw: (requestIds: string[]) => void;
  onOpenTrip: (tripId: string) => void;
  onFindDriver: (item: UpcomingItem) => void;
  onFindDrivers: () => void;
  onOpenHistory: () => void;
  onSetUpCommute: () => void;
}

// Rides is what's already decided, organized the way commuters think about it:
// the people you carpool with, then the schedule, with history a tap away.
export function RidesScreen({
  hasCommute,
  waitingOnYou,
  carpools,
  thisWeek,
  nextWeek,
  history,
  onReviewRequests,
  onOpenCarpool,
  onWithdraw,
  onOpenTrip,
  onFindDriver,
  onFindDrivers,
  onOpenHistory,
  onSetUpCommute,
}: RidesScreenProps) {
  const [showNextWeek, setShowNextWeek] = useState(false);

  if (!hasCommute) {
    return (
      <Screen title="Rides">
        <SetUpCommuteCard onPress={onSetUpCommute} />
      </Screen>
    );
  }

  return (
    <Screen title="Rides">
      {waitingOnYou > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={onReviewRequests}
          style={({ pressed }) => [styles.waiting, pressed && styles.waitingPressed]}
        >
          <View style={styles.waitingBadge}>
            <Text style={styles.waitingBadgeText}>{waitingOnYou}</Text>
          </View>
          <Text style={styles.waitingText}>
            {waitingOnYou === 1 ? 'A rider is' : `${waitingOnYou} riders are`} waiting on your answer
          </Text>
          <Text style={styles.waitingAction}>Review</Text>
        </Pressable>
      )}

      <View style={styles.section}>
        <SectionTitle title="Your carpools" />
        {carpools.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.empty}>
              No carpools yet. Once a driver accepts you, or you accept a rider, they show up here.
            </Text>
            <AppButton label="Find a driver" onPress={onFindDrivers} variant="secondary" />
          </Card>
        ) : (
          carpools.map((carpool) => (
            <CarpoolCard
              carpool={carpool}
              key={carpool.id}
              onOpen={() => onOpenCarpool(carpool)}
              onWithdraw={
                carpool.kind === 'driver' && carpool.pendingRequestIds.length > 0
                  ? () => onWithdraw(carpool.pendingRequestIds)
                  : undefined
              }
            />
          ))
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="This week" />
        {thisWeek.length === 0 ? (
          <Card>
            <Text style={styles.empty}>Nothing left on your schedule this week.</Text>
          </Card>
        ) : (
          <AgendaList items={thisWeek} onFindDriver={onFindDriver} onOpenTrip={onOpenTrip} />
        )}

        {nextWeek.length > 0 && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showNextWeek }}
              onPress={() => {
                Haptics.selectionAsync();
                setShowNextWeek((open) => !open);
              }}
              style={styles.disclosure}
            >
              <Text style={styles.disclosureTitle}>Next week</Text>
              <Text style={styles.disclosureMeta}>
                {nextWeek.length} day{nextWeek.length === 1 ? '' : 's'}
              </Text>
              <Ionicons
                color={colors.textMuted}
                name={showNextWeek ? 'chevron-up' : 'chevron-down'}
                size={18}
              />
            </Pressable>
            {showNextWeek && (
              <AgendaList items={nextWeek} onFindDriver={onFindDriver} onOpenTrip={onOpenTrip} />
            )}
          </>
        )}
      </View>

      {history && (
        <Pressable
          accessibilityLabel={`History: ${history.shared} rides shared, ${history.skipped} skipped, with ${history.people} people`}
          accessibilityRole="button"
          onPress={onOpenHistory}
          style={({ pressed }) => [styles.history, pressed && styles.historyPressed]}
        >
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>History</Text>
            <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
          </View>
          <View style={styles.stats}>
            <Stat label="rides shared" value={history.shared} />
            <Stat label="people" value={history.people} />
            <Stat label="skipped" value={history.skipped} />
          </View>
        </Pressable>
      )}
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text accessibilityRole="header" style={styles.sectionTitle}>
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  waiting: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  waitingPressed: {
    opacity: 0.8,
  },
  waitingBadge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 26,
    justifyContent: 'center',
    minWidth: 26,
  },
  waitingBadgeText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '800',
  },
  waitingText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  waitingAction: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  emptyCard: {
    gap: spacing.md,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  disclosure: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
  },
  disclosureTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  disclosureMeta: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 14,
  },
  history: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.lg,
  },
  historyPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  historyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stat: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flex: 1,
    gap: 2,
    padding: spacing.md,
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
