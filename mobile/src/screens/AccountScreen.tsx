import { StyleSheet, Text, View } from 'react-native';

import { AuthUser } from '../auth/authService';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { CommuteSchedule, describeDays, lotTitle } from '../commute/commuteModel';
import { OnboardingProfile, roleLabels } from '../onboarding/onboardingModel';
import { colors, radii, spacing } from '../theme';

interface AccountScreenProps {
  user: AuthUser;
  profile: OnboardingProfile | null;
  commute: CommuteSchedule | null;
  onEditCommute: () => void;
  onSignOut: () => void;
}

const providerLabels = {
  google: 'Signed in with Google',
  email: 'Signed in with email',
} as const;

export function AccountScreen({
  user,
  profile,
  commute,
  onEditCommute,
  onSignOut,
}: AccountScreenProps) {
  const displayName = profile?.firstName ?? user.email;

  return (
    <Screen eyebrow="YOUR PROFILE" title="Account">
      <Card style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text numberOfLines={1} style={styles.email}>
            {displayName}
          </Text>
          <Text numberOfLines={1} selectable style={styles.provider}>
            {profile ? user.email : providerLabels[user.provider]}
          </Text>
        </View>
      </Card>

      {profile && (
        <Card style={styles.summary}>
          <SummaryRow label="Getting around" value={roleLabels[profile.role]} />
        </Card>
      )}

      <Card style={styles.summary}>
        <Text style={styles.cardTitle}>Your commute</Text>
        {commute ? (
          <>
            <SummaryRow label="Starting from" value={commute.startArea.label} />
            <SummaryRow label="On campus" value={lotTitle(commute.campusLot)} />
            <SummaryRow label="Days" value={describeDays(commute.days)} />
            {commute.seats !== undefined && (
              <SummaryRow label="Seats to offer" value={String(commute.seats)} />
            )}
          </>
        ) : (
          <Text style={styles.empty}>Not set up yet. It’s how we find your matches.</Text>
        )}
        <AppButton
          label={commute ? 'Edit commute' : 'Set up my commute'}
          onPress={onEditCommute}
          variant={commute ? 'secondary' : 'primary'}
        />
      </Card>

      <AppButton label="Sign out" onPress={onSignOut} variant="secondary" />
    </Screen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  profileCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  avatarText: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: '800',
  },
  profileCopy: {
    flex: 1,
    gap: 2,
  },
  email: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  provider: {
    color: colors.textMuted,
    fontSize: 13,
  },
  summary: {
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 15,
  },
  summaryValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
});
