import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { AuthProviderButton } from '../../components/AuthProviderButton';
import { FlowProgress, FlowStep } from '../../components/flow/FlowStep';
import { TextField } from '../../components/TextField';
import { colors, radii, spacing } from '../../theme';
import { Coordinates, PRIVACY_RADIUS_MILES, toPrivacyArea } from '../commuteModel';
import { useCommuteDraft } from '../CommuteDraftProvider';
import { PrivacyAreaMap } from '../components/PrivacyAreaMap';

interface StartAreaStepProps {
  progress?: FlowProgress;
  continueLabel?: string;
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

export function StartAreaStep({
  progress,
  onContinue,
  leading,
  onLeadingPress,
  continueLabel,
}: StartAreaStepProps) {
  const { draft, updateDraft } = useCommuteDraft();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const area = draft.startArea;

  // Persist only coordinates, never the searched address or geocoder metadata.
  async function saveAreaAround(exact: Coordinates) {
    const snapped = toPrivacyArea(exact, '');
    updateDraft({
      startPoint: { latitude: exact.latitude, longitude: exact.longitude },
      startArea: { ...snapped, label: await labelFor(snapped.center) },
    });
  }

  async function useCurrentLocation() {
    setError(null);
    setStatus('locating');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError(
          'Location access is off. Search for a pickup address or public meeting point instead.',
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await saveAreaAround(position.coords);
    } catch {
      setError('We couldn’t get your location. Try searching for a pickup address instead.');
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
        setError(`We couldn’t find “${text}”. Try a complete address or public meeting point.`);
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
      continueLabel={continueLabel}
      canContinue={area !== undefined && draft.startPoint !== undefined && status === 'idle'}
      leading={leading}
      onContinue={onContinue}
      onLeadingPress={onLeadingPress}
      progress={progress}
      reaction={
        area
          ? `This ${PRIVACY_RADIUS_MILES}-mile area is what other users see before you both confirm a ride. Your exact point is saved privately for routing and shared only with your accepted ride partner.`
          : null
      }
      subtitle="Choose your starting address or a public meeting point. Check the pin before continuing. The routing provider receives this point to calculate road estimates."
      title="Where do you usually leave from?"
    >
      {area ? (
        <View style={{ gap: spacing.md }}>
          {draft.startPoint && (
            <>
              <Text>Your private starting point — drag the pin to correct it.</Text>
              <MapView
                style={{ height: 220 }}
                region={{
                  ...draft.startPoint,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker
                  coordinate={draft.startPoint}
                  draggable
                  onDragEnd={(event) => {
                    setStatus('searching');
                    void saveAreaAround(event.nativeEvent.coordinate).finally(() =>
                      setStatus('idle'),
                    );
                  }}
                  title="Your private starting point"
                />
              </MapView>
            </>
          )}
          <Text>This is what other users see before confirming a commute:</Text>
          <PrivacyAreaMap area={area} />
        </View>
      ) : (
        <View style={styles.privacyCard}>
          <Ionicons color={colors.accent} name="shield-checkmark-outline" size={24} />
          <Text style={styles.privacyText}>
            Pick a precise starting point. Other users initially see only a {PRIVACY_RADIUS_MILES}
            -mile area before anyone sees it.
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
        label="Search a pickup address or public place"
        onChangeText={setQuery}
        onSubmitEditing={search}
        placeholder="e.g. Stony Brook LIRR station"
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
