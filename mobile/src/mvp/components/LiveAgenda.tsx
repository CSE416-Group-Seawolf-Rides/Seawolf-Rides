import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTime, weekdays } from '../../commute/commuteModel';
import { weekdayForDate } from '../settings';
import { requestRecipient } from '../rideRequestModel';
import { partnerName, rideTime, type LiveAgendaDay } from '../ridePresentation';
import { colors, radii, spacing } from '../../theme';

export function LiveAgenda({ days, uid }: { days: LiveAgendaDay[]; uid: string }) {
  return (
    <View style={styles.group}>
      {days.map((day, index) => {
        const request = day.requests[0];
        const headline =
          day.status === 'confirmed'
            ? `${rideTime(day.mode === 'drive' ? request.plan.departure : request.plan.pickup)} · ${partnerName(request, uid)}`
            : day.status === 'pending'
              ? `${day.requests.length} pending request${day.requests.length === 1 ? '' : 's'}`
              : day.mode === 'drive'
                ? 'No passenger yet'
                : day.mode === 'ride'
                  ? 'No driver yet'
                  : 'No ride yet';
        const detail =
          day.status === 'confirmed'
            ? `${day.mode === 'drive' ? 'Driving' : 'Riding'} · ${request.campusLabel}`
            : day.status === 'pending'
              ? requestRecipient(request) === uid
                ? 'Waiting on your answer'
                : `Waiting for ${partnerName(request, uid)}`
              : `Arrive around ${formatTime(day.schedule!.arriveBy!)}`;
        return (
          <Pressable
            key={day.date}
            accessibilityRole="button"
            accessibilityLabel={`${day.date}, ${headline}, ${detail}`}
            onPress={() =>
              request
                ? router.push(`/rides/${request.id}`)
                : router.navigate({
                    pathname: '/home',
                    params: { date: day.date },
                  })
            }
            style={[styles.row, index < days.length - 1 && styles.divider]}
          >
            <View style={styles.date}>
              <Text style={styles.weekday}>
                {weekdays.find((d) => d.value === weekdayForDate(day.date))?.short.toUpperCase()}
              </Text>
              <Text style={styles.number}>{Number(day.date.slice(-2))}</Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.headline}>{headline}</Text>
              <Text style={[styles.detail, day.status === 'pending' && styles.pending]}>
                {detail}
              </Text>
            </View>
            {day.status === 'open' ? (
              <Text style={styles.find}>Find</Text>
            ) : (
              <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    minHeight: 84,
  },
  divider: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  date: { width: 38, alignItems: 'center', gap: spacing.xs },
  weekday: { fontSize: 11, fontWeight: '800', color: colors.textMuted },
  number: { fontSize: 22, fontWeight: '800', color: colors.text },
  copy: { flex: 1, gap: spacing.xs },
  headline: { fontWeight: '700', fontSize: 15, color: colors.text },
  detail: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  pending: { color: colors.accent },
  find: { color: colors.accent, fontSize: 14, fontWeight: '800' },
});
