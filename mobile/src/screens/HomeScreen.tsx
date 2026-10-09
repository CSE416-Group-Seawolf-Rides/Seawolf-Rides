import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { SetUpCommuteCard } from '../components/SetUpCommuteCard';
import { CommuteSchedule, Weekday } from '../commute/commuteModel';
import type { CommuteRole } from '../onboarding/onboardingModel';
import { DriverCarousel } from '../rides/components/DriverCarousel';
import { NextTripCard } from '../rides/components/NextTripCard';
import { RequestSheet } from '../rides/components/RequestSheet';
import { RequestsSummaryCard } from '../rides/components/RequestsSummaryCard';
import { WeekStrip } from '../rides/components/WeekStrip';
import {
  DayOverview,
  DriverMatch,
  IncomingRequestView,
  NextTrip,
  RequestStatus,
} from '../rides/rideModel';
import { colors, radii, spacing } from '../theme';

// A day in the next week the user rides but has no driver for yet.
export interface OpenDayView {
  day: Weekday;
  label: string;
  pending: boolean;
  matches: DriverMatch[];
}

interface HomeScreenProps {
  greeting: string;
  dateLabel: string;
  role: CommuteRole;
  commute: CommuteSchedule | null;
  overview: DayOverview[];
  dates: Record<Weekday, number>;
  today: Weekday;
  nextTrip: NextTrip | null;
  actionableDays: Weekday[];
  pendingRequests: IncomingRequestView[];
  openDays: OpenDayView[];
  // Drivers shown to someone who hasn't set up a commute yet.
  previewMatches: DriverMatch[];
  ridesSomeDays: boolean;
  statusFor: (offerId: string, day?: Weekday) => RequestStatus | undefined;
  requestableDaysFor: (offerId: string) => Weekday[];
  onPressDay: (day: Weekday) => void;
  onReviewRequests: () => void;
  onOpenOffer: (offerId: string) => void;
  onSeeAllDrivers: (day: Weekday) => void;
  onSendRequest: (offerId: string, days: Weekday[]) => void;
  onOpenTrip?: () => void;
  onMessageTrip?: () => void;
  onSetUpCommute: () => void;
  onOpenMatchingDemo?: () => void;
  onOpenRoutePlanner?: () => void;
}

// Home answers "what's next?" and "what needs me?" and stays about one screen tall:
// decisions are summed up and reviewed one at a time, and drivers appear only for the
// days that still need one, in a single sideways row.
export function HomeScreen({
  greeting,
  dateLabel,
  role,
  commute,
  overview,
  dates,
  today,
  nextTrip,
  actionableDays,
  pendingRequests,
  openDays,
  previewMatches,
  ridesSomeDays,
  statusFor,
  requestableDaysFor,
  onPressDay,
  onReviewRequests,
  onOpenOffer,
  onSeeAllDrivers,
  onSendRequest,
  onOpenTrip,
  onMessageTrip,
  onSetUpCommute,
  onOpenMatchingDemo,
  onOpenRoutePlanner,
}: HomeScreenProps) {
  const [chosenDay, setChosenDay] = useState<Weekday | null>(null);
  const [requesting, setRequesting] = useState<{ match: DriverMatch; day?: Weekday } | null>(null);

  // Keep the chosen chip if that day is still open; otherwise fall back to the first.
  const activeDay = openDays.find((open) => open.day === chosenDay) ?? openDays[0];
  const commuteDays = overview.filter((day) => day.status !== 'off' && day.status !== 'skipped');
  const confirmedDays = commuteDays.filter((day) => day.status === 'confirmed').length;
  const requestDays = [...new Set(pendingRequests.flatMap((view) => view.sharedDays))];

  return (
    <Screen eyebrow={dateLabel} title={greeting}>
      {!commute && <SetUpCommuteCard onPress={onSetUpCommute} />}

      {nextTrip && <NextTripCard onDetails={onOpenTrip} onMessage={onMessageTrip} trip={nextTrip} />}

      {commute && (
        <Card style={styles.weekCard}>
          <View style={styles.weekHeader}>
            <Text style={styles.weekTitle}>This week</Text>
            <Text style={styles.weekSummary}>
              {confirmedDays} of {commuteDays.length} day{commuteDays.length === 1 ? '' : 's'}{' '}
              confirmed
            </Text>
          </View>
          <WeekStrip
            actionableDays={actionableDays}
            dates={dates}
            onPressDay={onPressDay}
            overview={overview}
            showModes={role === 'both'}
            today={today}
          />
        </Card>
      )}

      {pendingRequests.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Needs you" />
          <RequestsSummaryCard
            days={requestDays}
            onReview={onReviewRequests}
            requests={pendingRequests.map((view) => view.request)}
          />
        </View>
      )}

      {commute && ridesSomeDays && activeDay && (
        <View style={styles.section}>
          <SectionHeader
            onSeeAll={() => onSeeAllDrivers(activeDay.day)}
            subtitle={
              openDays.length === 1
                ? `${activeDay.label} still needs a driver.`
                : `${openDays.length} days still need a driver.`
            }
            title="Find a driver"
          />
          {openDays.length > 1 && (
            <ScrollView
              contentContainerStyle={styles.chips}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsBleed}
            >
              {openDays.map((open) => {
                const selected = open.day === activeDay.day;
                return (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    key={open.day}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setChosenDay(open.day);
                    }}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {open.label}
                    </Text>
                    {open.pending && <View style={styles.pendingDot} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {activeDay.matches.length === 0 ? (
            <EmptyNote
              text={`No drivers go on ${activeDay.label} yet. New drivers show up here as they join.`}
            />
          ) : (
            <DriverCarousel
              canRequest
              matches={activeDay.matches}
              onOpen={onOpenOffer}
              onRequest={(match) => setRequesting({ match, day: activeDay.day })}
              onSeeAll={() => onSeeAllDrivers(activeDay.day)}
              statusFor={(offerId) => statusFor(offerId, activeDay.day)}
            />
          )}
        </View>
      )}

      {commute && ridesSomeDays && !activeDay && (
        <View style={styles.allSet}>
          <Ionicons color={colors.success} name="checkmark-circle" size={24} />
          <Text style={styles.allSetText}>Every ride this week has a driver.</Text>
        </View>
      )}

      {!commute && role !== 'driver' && previewMatches.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            subtitle="Set up your commute to see who fits your week."
            title="Drivers heading to campus"
          />
          <DriverCarousel
            canRequest={false}
            matches={previewMatches}
            onOpen={onOpenOffer}
            onRequest={() => undefined}
            statusFor={() => undefined}
          />
        </View>
      )}

      {__DEV__ && onOpenMatchingDemo && (
        <Card style={styles.developerCard}>
          <View style={styles.developerHeader}>
            <Ionicons color={colors.accent} name="flask-outline" size={24} />
            <View style={styles.developerCopy}>
              <Text accessibilityRole="header" style={styles.developerTitle}>
                Matching Demo
              </Text>
              <Text style={styles.developerBody}>
                Run the pure feasibility evaluator with supplied fixture travel times.
              </Text>
            </View>
          </View>
          <AppButton label="Open Matching Demo" onPress={onOpenMatchingDemo} variant="secondary" />
        </Card>
      )}

      {__DEV__ && onOpenRoutePlanner && (
        <Card style={styles.developerCard}>
          <View style={styles.developerHeader}>
            <Ionicons color={colors.accent} name="navigate-outline" size={24} />
            <View style={styles.developerCopy}>
              <Text accessibilityRole="header" style={styles.developerTitle}>
                Route Planner
              </Text>
              <Text style={styles.developerBody}>
                Select two public test points and inspect an OSRM driving route.
              </Text>
            </View>
          </View>
          <AppButton label="Open Route Planner" onPress={onOpenRoutePlanner} variant="secondary" />
        </Card>
      )}

      <Text style={styles.demoNote}>
        Demo data: drivers and riders are sample profiles, and drivers accept requests
        automatically after a few seconds.
      </Text>

      {requesting && (
        <RequestSheet
          initialDays={requesting.day ? [requesting.day] : undefined}
          offer={requesting.match.offer}
          onClose={() => setRequesting(null)}
          onSend={(days) => {
            onSendRequest(requesting.match.offer.id, days);
            setRequesting(null);
          }}
          sharedDays={requestableDaysFor(requesting.match.offer.id)}
        />
      )}
    </Screen>
  );
}

function SectionHeader({
  title,
  subtitle,
  onSeeAll,
}: {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {onSeeAll && (
        <Pressable
          accessibilityLabel={`See all: ${title}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onSeeAll}
          style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
        >
          <Ionicons color={colors.text} name="arrow-forward" size={20} />
        </Pressable>
      )}
    </View>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <Card>
      <Text style={styles.empty}>{text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  weekCard: {
    gap: spacing.md,
  },
  weekHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  weekSummary: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  sectionCopy: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
  },
  arrow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  arrowPressed: {
    backgroundColor: colors.border,
  },
  chipsBleed: {
    marginHorizontal: -spacing.xl,
  },
  chips: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  chip: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: spacing.lg,
  },
  chipSelected: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: colors.surface,
  },
  pendingDot: {
    backgroundColor: colors.warning,
    borderRadius: radii.pill,
    height: 7,
    width: 7,
  },
  allSet: {
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  allSetText: {
    color: colors.success,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  developerCard: {
    gap: spacing.md,
  },
  developerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  developerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  developerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  developerBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  demoNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
  },
});
