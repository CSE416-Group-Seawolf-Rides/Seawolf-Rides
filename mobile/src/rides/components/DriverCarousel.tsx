import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { formatTime, lotTitle } from '../../commute/commuteModel';
import { colors, radii, spacing } from '../../theme';
import { describeArrivalFit, DriverMatch, RequestStatus } from '../rideModel';
import { StatusPill } from './StatusPill';

const MAX_CARDS = 5;

interface DriverCarouselProps {
  matches: DriverMatch[];
  canRequest: boolean;
  statusFor: (offerId: string) => RequestStatus | undefined;
  onOpen: (offerId: string) => void;
  onRequest: (match: DriverMatch) => void;
  onSeeAll?: () => void;
}

// One row of the best drivers, swiped sideways with the next card peeking in. Height
// stays fixed no matter how many drivers there are; the rest are one tap away.
export function DriverCarousel({
  matches,
  canRequest,
  statusFor,
  onOpen,
  onRequest,
  onSeeAll,
}: DriverCarouselProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(320, Math.round(width * 0.76));
  const shown = matches.slice(0, MAX_CARDS);
  const hidden = matches.length - shown.length;

  return (
    <ScrollView
      contentContainerStyle={styles.row}
      decelerationRate="fast"
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + spacing.md}
      style={styles.bleed}
    >
      {shown.map((match, index) => (
        <DriverCard
          canRequest={canRequest}
          key={match.offer.id}
          match={match}
          onOpen={() => onOpen(match.offer.id)}
          onRequest={() => onRequest(match)}
          rank={index}
          status={statusFor(match.offer.id)}
          width={cardWidth}
        />
      ))}
      {onSeeAll && hidden > 0 && (
        <Pressable
          accessibilityLabel={`See all ${matches.length} drivers`}
          accessibilityRole="button"
          onPress={onSeeAll}
          style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
        >
          <View style={styles.seeAllIcon}>
            <Ionicons color={colors.accent} name="arrow-forward" size={22} />
          </View>
          <Text style={styles.seeAllText}>See all {matches.length}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function DriverCard({
  match,
  status,
  canRequest,
  rank,
  width,
  onOpen,
  onRequest,
}: {
  match: DriverMatch;
  status?: RequestStatus;
  canRequest: boolean;
  rank: number;
  width: number;
  onOpen: () => void;
  onRequest: () => void;
}) {
  const { offer, arrivalGap } = match;
  const fit = describeArrivalFit(arrivalGap);

  return (
    <Pressable
      accessibilityHint="Opens the driver’s commute"
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Avatar name={offer.driverName} />
        <View style={styles.headerCopy}>
          <Text style={styles.name}>{offer.driverName}</Text>
          <Text numberOfLines={1} style={styles.meta}>
            {offer.startAreaLabel}
          </Text>
        </View>
        {rank === 0 && canRequest && <StatusPill label="Best fit" tone="success" />}
      </View>

      <View style={styles.times}>
        <View>
          <Text style={styles.timeLabel}>PICKUP</Text>
          <Text style={styles.time}>~{formatTime(offer.pickupTime)}</Text>
        </View>
        <Ionicons color={colors.textMuted} name="arrow-forward" size={16} />
        <View>
          <Text style={styles.timeLabel}>{lotTitle(offer.campusLot).toUpperCase()}</Text>
          <Text style={styles.time}>{formatTime(offer.arriveBy)}</Text>
        </View>
      </View>

      <Text numberOfLines={1} style={[styles.fit, fit && !fit.good && styles.fitLate]}>
        {fit
          ? fit.label
          : `${offer.leaveAt === null ? 'Morning only' : `Leaves ${formatTime(offer.leaveAt)}`} · ${offer.seatsLeft} seat${offer.seatsLeft === 1 ? '' : 's'} open`}
      </Text>

      {status === 'accepted' ? (
        <StatusPill label="Confirmed" tone="success" />
      ) : status === 'pending' ? (
        <StatusPill label="Requested · waiting" tone="warning" />
      ) : (
        canRequest && (
          <AppButton
            accessibilityLabel={`Request a ride with ${offer.driverName}`}
            label="Request"
            onPress={onRequest}
            variant="secondary"
          />
        )
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Lets cards run to the screen edge while the first one lines up with the page.
  bleed: {
    marginHorizontal: -spacing.xl,
  },
  row: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
  },
  times: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  timeLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  time: {
    color: colors.text,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  fit: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  fitLate: {
    color: colors.warning,
  },
  seeAll: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    width: 120,
  },
  seeAllIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  seeAllText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
  },
});
