import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthProviderButton } from '../../components/AuthProviderButton';
import { FlowProgress, FlowStep } from '../../components/flow/FlowStep';
import { TextField } from '../../components/TextField';
import { colors, radii, spacing } from '../../theme';
import { Coordinates, PRIVACY_RADIUS_MILES, toPrivacyArea } from '../commuteModel';
import { useCommuteDraft } from '../CommuteDraftProvider';
import { PrivacyAreaMap } from '../components/PrivacyAreaMap';

interface StartAreaStepProps {
  progress: FlowProgress;
  onContinue: () => void;
  leading?: 'back' | 'close';
  onLeadingPress?: () => void;
}

type Status = 'idle' | 'locating' | 'searching';

// Town-level name for the snapped (not exact) center, so even the label is approximate.
async function labelFor(center: Coordinates): Promise<string> {
  try {
    const [place] = await Location.reverseGeocodeAsync(center);
    const name = place?.city ?? place?.district ?? place?.subregion;
    return name ? `${name} area` : 'Your area';
  } catch {
    return 'Your area';
  }
}

export function StartAreaStep({ progress, onContinue, leading, onLeadingPress }: StartAreaStepProps) {
  const { draft, updateDraft } = useCommuteDraft();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const area = draft.startArea;

  // The exact point only lives inside this function; only the privacy area is kept.
  async function saveAreaAround(exact: Coordinates) {
    const snapped = toPrivacyArea(exact, '');
    updateDraft({ startArea: { ...snapped, label: await labelFor(snapped.center) } });
  }

  async function useCurrentLocation() {
    setError(null);
    setStatus('locating');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location access is off. Search for your town instead.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await saveAreaAround(position.coords);
    } catch {
      setError('We couldn’t get your location. Try searching for your town instead.');
    } finally {
      setStatus('idle');
    }
  }

  async function search() {
    const text = query.trim();
    if (!text) {
      return;
    }
    setError(null);
    setStatus('searching');
    try {
      // Bias searches toward New York, where nearly every commute starts.
      const address = /\b(ny|new york)\b/i.test(text) ? text : `${text}, NY`;
      const [result] = await Location.geocodeAsync(address);
      if (!result) {
        setError(`We couldn’t find “${text}”. Try a town name, like Centereach.`);
        return;
      }
      await saveAreaAround(result);
    } catch {
      setError('Search isn’t working right now. Try using your current location.');
    } finally {
      setStatus('idle');
    }
  }

  return (
    <FlowStep
      canContinue={area !== undefined && status === 'idle'}
      leading={leading}
      onContinue={onContinue}
      onLeadingPress={onLeadingPress}
      progress={progress}
      reaction={
        area
          ? `Others will only see “${area.label}” and this ${PRIVACY_RADIUS_MILES}-mile circle. Your exact spot is never saved.`
          : null
      }
      subtitle={`We only ever show a ${PRIVACY_RADIUS_MILES}-mile area around it — never your address.`}
      title="Where do you usually leave from?"
    >
      {area ? (
        <PrivacyAreaMap area={area} />
      ) : (
        <View style={styles.privacyCard}>
          <Ionicons color={colors.accent} name="shield-checkmark-outline" size={24} />
          <Text style={styles.privacyText}>
            Pick your home, a nearby street, or just your town. We blur it into a{' '}
            {PRIVACY_RADIUS_MILES}-mile area before anyone sees it.
          </Text>
        </View>
      )}

      <AuthProviderButton
        disabled={status !== 'idle'}
        icon={<Ionicons color={colors.text} name="navigate-outline" size={20} />}
        label={area ? 'Use my current location instead' : 'Use my current location'}
        loading={status === 'locating'}
        onPress={useCurrentLocation}
      />

      <Text style={styles.or}>or</Text>

      <TextField
        accessory={
          <Pressable
            accessibilityLabel="Search"
            accessibilityRole="button"
            disabled={status !== 'idle' || !query.trim()}
            hitSlop={10}
            onPress={search}
          >
            <Ionicons
              color={query.trim() ? colors.accent : colors.textMuted}
              name="search"
              size={22}
            />
          </Pressable>
        }
        autoCapitalize="words"
        autoCorrect={false}
        editable={status === 'idle'}
        error={error ?? undefined}
        helperText={status === 'searching' ? 'Searching…' : undefined}
        label="Search a town or address"
        onChangeText={setQuery}
        onSubmitEditing={search}
        placeholder="e.g. Centereach"
        returnKeyType="search"
        value={query}
      />
    </FlowStep>
  );
}

const styles = StyleSheet.create({
  privacyCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  privacyText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  or: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
