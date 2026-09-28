import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import type { CommuteRole } from '../../onboarding/onboardingModel';
import { colors, radii, spacing } from '../../theme';
import { CommuteSchedule, dayModeLabels, formatTime, lotTitle, weekdays } from '../commuteModel';
import { PrivacyAreaMap } from './PrivacyAreaMap';

interface CommuteSummaryCardProps {
  commute: CommuteSchedule | null;
  role: CommuteRole;
  onEdit: () => void;
}

// The commute drives every match, so Account gives it the most room: where you start,
// where you park, and your whole week at a glance, one tap from editing.
export function CommuteSummaryCard({ commute, role, onEdit }: CommuteSummaryCardProps) {
  if (!commute) {
    return (
      <View style={[styles.card, styles.empty]}>
        <Text style={styles.title}>Your commute</Text>
        <Text style={styles.emptyBody}>
          Not set up yet. Tell us where you start, where you park, and your week. It’s how we
          find your matches.
        </Text>
        <AppButton label="Set up my commute" onPress={onEdit} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <PrivacyAreaMap area={commute.startArea} height={132} />
      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={styles.title}>Your commute</Text>
          {commute.seats !== undefined && (
            <Text style={styles.seats}>
              {commute.seats} seat{commute.seats === 1 ? '' : 's'} offered
            </Text>
          )}
        </View>
        <Text style={styles.route}>
          {commute.startArea.label} → {lotTitle(commute.campusLot)}
        </Text>

        <View style={styles.week}>
          {commute.days.map((plan) => (
            <View key={plan.day} style={styles.dayRow}>
              <Text style={styles.day}>
                {weekdays.find((weekday) => weekday.value === plan.day)?.short}
              </Text>
              <Text style={styles.times}>
                {plan.arriveBy === null ? 'No ride there' : formatTime(plan.arriveBy)}
                {'  →  '}
                {plan.leaveAt === null ? 'No ride back' : formatTime(plan.leaveAt)}
              </Text>
              {role === 'both' && <Text style={styles.mode}>{dayModeLabels[plan.mode]}</Text>}
            </View>
          ))}
        </View>

        <AppButton label="Edit commute" onPress={onEdit} variant="secondary" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  empty: {
    borderColor: colors.accent,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  body: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  header: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  seats: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  route: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: -spacing.sm,
  },
  week: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  dayRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  day: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
    width: 34,
  },
  times: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  mode: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
