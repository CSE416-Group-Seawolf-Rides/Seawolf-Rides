import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import type { OnboardingProfile } from '../onboarding/onboardingModel';
import {
  MAX_PROFILE_BIO_LENGTH,
  MAX_PROFILE_PHOTO_LENGTH,
  parseUserProfileDocument,
  USER_DATA_SCHEMA_VERSION,
} from '../persistence/userDataModel';
import { colors, spacing } from '../theme';

export function EditProfileScreen({
  initial,
  onBack,
  onSave,
}: {
  initial: OnboardingProfile;
  onBack: () => void;
  onSave: (profile: OnboardingProfile) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(initial.firstName);
  const [bio, setBio] = useState(initial.bio ?? '');
  const [photoBase64, setPhotoBase64] = useState(initial.photoBase64 ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function pickPhoto() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        exif: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize({ width: Math.min(512, asset.width) });
      const image = await context.renderAsync();
      const jpeg = await image.saveAsync({
        base64: true,
        compress: 0.65,
        format: SaveFormat.JPEG,
      });
      if (!jpeg.base64 || jpeg.base64.length > MAX_PROFILE_PHOTO_LENGTH) {
        throw new Error('Choose a smaller profile photo.');
      }
      setPhotoBase64(jpeg.base64);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open that photo.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const profile = parseUserProfileDocument({
        schemaVersion: USER_DATA_SCHEMA_VERSION,
        firstName,
        role: initial.role,
        ...(bio.trim() ? { bio } : {}),
        ...(photoBase64 ? { photoBase64 } : {}),
      });
      await onSave(profile);
      onBack();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Check your connection and try again.';
      setError(message);
      Alert.alert('Couldn’t save your profile', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      onBack={busy ? undefined : onBack}
      subtitle="This name, photo and bio are visible to verified Stony Brook riders and drivers."
      title="Edit public profile"
    >
      <View style={styles.photo}>
        <Avatar
          imageSource={photoBase64 ? { uri: `data:image/jpeg;base64,${photoBase64}` } : null}
          name={firstName.trim() || 'Rider'}
          size={112}
        />
        <View style={styles.photoActions}>
          <AppButton
            disabled={busy}
            label={photoBase64 ? 'Change photo' : 'Add photo'}
            onPress={() => void pickPhoto()}
            variant="secondary"
          />
          {photoBase64 ? (
            <AppButton disabled={busy} label="Remove photo" onPress={() => setPhotoBase64('')} variant="secondary" />
          ) : null}
        </View>
      </View>
      <TextField
        autoCapitalize="words"
        label="Display name"
        maxLength={80}
        onChangeText={setFirstName}
        value={firstName}
      />
      <TextField
        helperText={`${bio.length}/${MAX_PROFILE_BIO_LENGTH} · Don’t include contact details or exact locations.`}
        label="Short bio (optional)"
        maxLength={MAX_PROFILE_BIO_LENGTH}
        multiline
        onChangeText={setBio}
        placeholder="e.g. CS student commuting from Centereach"
        value={bio}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <AppButton
        disabled={busy || !firstName.trim()}
        label={busy ? 'Saving…' : 'Save profile'}
        onPress={() => void save()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { alignItems: 'center', gap: spacing.lg },
  photoActions: { alignSelf: 'stretch', gap: spacing.sm },
  error: { color: colors.error, fontSize: 14 },
});
