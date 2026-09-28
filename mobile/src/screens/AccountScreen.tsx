import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { AuthUser } from '../auth/authService';
import { Avatar } from '../components/Avatar';
import { ChoiceSheet } from '../components/ChoiceSheet';
import { Screen } from '../components/Screen';
import { SettingsAction, SettingsGroup, SettingsRow } from '../components/settings/SettingsGroup';
import { CommuteSchedule, PRIVACY_RADIUS_MILES } from '../commute/commuteModel';
import { CommuteSummaryCard } from '../commute/components/CommuteSummaryCard';
import { CommuteRole, roleLabels, roleOptions } from '../onboarding/onboardingModel';
import { colors, radii, spacing } from '../theme';

interface AccountScreenProps {
  user: AuthUser;
  firstName: string | null;
  role: CommuteRole;
  commute: CommuteSchedule | null;
  version: string;
  onEditCommute: () => void;
  onChangeRole: (role: CommuteRole) => void;
  onSignOut: () => void;
}

type Sheet = 'role' | 'privacy' | 'signOut' | null;

// Account, top to bottom by how often it's needed: who you are, your commute (the
// setting that drives every match), then everyday preferences, safety, and help.
export function AccountScreen({
  user,
  firstName,
  role,
  commute,
  version,
  onEditCommute,
  onChangeRole,
  onSignOut,
}: AccountScreenProps) {
  const [sheet, setSheet] = useState<Sheet>(null);
  // Prototype: preferences live on this screen until accounts are stored.
  const [requestAlerts, setRequestAlerts] = useState(true);
  const [pickupReminders, setPickupReminders] = useState(true);
  const displayName = firstName ?? user.email;
  const drives = role !== 'rider';

  return (
    <Screen title="Account">
      <View style={styles.identity}>
        <Avatar name={displayName} size={60} />
        <View style={styles.identityCopy}>
          <Text numberOfLines={1} style={styles.name}>
            {displayName}
          </Text>
          <Text numberOfLines={1} selectable style={styles.email}>
            {user.email}
          </Text>
          <View style={styles.badges}>
            <View style={styles.verified}>
              <Ionicons color={colors.success} name="shield-checkmark" size={13} />
              <Text style={styles.verifiedText}>Stony Brook verified</Text>
            </View>
            <Text style={styles.roleText}>{roleLabels[role]}</Text>
          </View>
        </View>
      </View>

      <CommuteSummaryCard commute={commute} onEdit={onEditCommute} role={role} />

      <SettingsGroup title="Carpool">
        <SettingsRow
          icon="swap-horizontal"
          label="How you get around"
          last={!drives}
          onPress={() => setSheet('role')}
          value={roleLabels[role]}
        />
        {drives && <SettingsRow icon="car-outline" label="Your vehicle" last soon />}
      </SettingsGroup>

      <SettingsGroup title="Notifications">
        <SettingsRow
          accessory={
            <Switch
              accessibilityLabel="Ride request alerts"
              onValueChange={setRequestAlerts}
              trackColor={{ true: colors.accent }}
              value={requestAlerts}
            />
          }
          icon="notifications-outline"
          label="Ride requests"
        />
        <SettingsRow
          accessory={
            <Switch
              accessibilityLabel="Pickup reminders"
              onValueChange={setPickupReminders}
              trackColor={{ true: colors.accent }}
              value={pickupReminders}
            />
          }
          icon="alarm-outline"
          label="Pickup reminders"
          last
        />
      </SettingsGroup>

      <SettingsGroup title="Safety & privacy">
        <SettingsRow
          icon="location-outline"
          label="How your location is shared"
          onPress={() => setSheet('privacy')}
        />
        <SettingsRow icon="call-outline" label="Emergency contact" soon />
        <SettingsRow icon="ban-outline" label="Blocked people" last soon />
      </SettingsGroup>

      <SettingsGroup title="Help">
        <SettingsRow icon="help-circle-outline" label="Help center" soon />
        <SettingsRow icon="flag-outline" label="Report a problem" soon />
        <SettingsRow icon="document-text-outline" label="Terms & privacy policy" last soon />
      </SettingsGroup>

      <SettingsAction destructive label="Sign out" onPress={() => setSheet('signOut')} />

      <View style={styles.footer}>
        <Text style={styles.footerLink}>Delete account (coming soon)</Text>
        <Text style={styles.footerText}>Seawolf Rides {version} · Made at Stony Brook</Text>
      </View>

      {sheet === 'role' && (
        <ChoiceSheet
          choices={roleOptions.map((option) => ({
            label: option.value === role ? `${option.title} (current)` : option.title,
            description: option.description,
            onPress: () => {
              setSheet(null);
              if (option.value !== role) {
                onChangeRole(option.value);
              }
            },
          }))}
          message="We’ll update each commute day and remove carpools that no longer fit how you travel."
          onClose={() => setSheet(null)}
          title="How do you get to campus?"
        />
      )}

      {sheet === 'privacy' && (
        <ChoiceSheet
          cancelLabel="Got it"
          choices={[]}
          message={`Others only ever see a ${PRIVACY_RADIUS_MILES}-mile area around where you start, never your address or exact location. Your exact pickup spot is shared only with people you’ve confirmed a ride with.`}
          onClose={() => setSheet(null)}
          title="Your location stays private"
        />
      )}

      {sheet === 'signOut' && (
        <ChoiceSheet
          cancelLabel="Stay signed in"
          choices={[
            {
              label: 'Sign out',
              destructive: true,
              onPress: () => {
                setSheet(null);
                onSignOut();
              },
            },
          ]}
          onClose={() => setSheet(null)}
          title="Sign out of Seawolf Rides?"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  identityCopy: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  email: {
    color: colors.textMuted,
    fontSize: 14,
  },
  badges: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 2,
  },
  verified: {
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  verifiedText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '800',
  },
  roleText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  footerLink: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
