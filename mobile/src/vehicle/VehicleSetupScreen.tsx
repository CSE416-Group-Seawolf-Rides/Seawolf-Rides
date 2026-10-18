import { useState } from 'react';
import { Image, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FlowStep } from '../components/flow/FlowStep';
import { TextField } from '../components/TextField';
import { AppButton } from '../components/AppButton';
import { useSession } from '../auth/SessionProvider';
import { parseVehicle, MAX_VEHICLE_PHOTO_LENGTH } from './vehicleModel';
import { saveVehicle, useVehicle } from './vehicleClient';

export function VehicleSetupScreen({
  onDone,
  onSkip,
}: {
  onDone: () => void;
  onSkip: () => void;
}) {
  const { user } = useSession();
  const saved = useVehicle(user?.id);
  // Mount the editable form only once the owner-only record has loaded.
  if (!saved.loaded)
    return (
      <FlowStep
        title="Your vehicle"
        canContinue={false}
        onContinue={() => {}}
        leading="close"
        onLeadingPress={onSkip}
      >
        <Text>{saved.error ?? 'Loading your vehicle…'}</Text>
      </FlowStep>
    );
  return (
    <VehicleForm
      key={user?.id}
      initial={saved.vehicle}
      uid={user!.id}
      onDone={onDone}
      onSkip={onSkip}
    />
  );
}
function VehicleForm({
  initial,
  uid,
  onDone,
  onSkip,
}: {
  initial?: import('./vehicleModel').VehicleDetails;
  uid: string;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(initial ? 0 : -1);
  const [type, setType] = useState(initial?.type ?? '');
  const [color, setColor] = useState(initial?.color ?? '');
  const [photo, setPhoto] = useState(initial?.photoBase64 ?? '');
  const [plate, setPlate] = useState(initial?.plate ?? '');
  const [region, setRegion] = useState(initial?.plateRegion ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function pickPhoto() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        exif: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize(
        asset.width >= asset.height
          ? { width: Math.min(800, asset.width) }
          : { height: Math.min(800, asset.height) },
      );
      const image = await context.renderAsync();
      const jpeg = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.65,
        base64: true,
      });
      if (!jpeg.base64 || jpeg.base64.length > MAX_VEHICLE_PHOTO_LENGTH)
        throw new Error('Choose a smaller photo of your car.');
      setPhoto(jpeg.base64);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open your photo.');
    } finally {
      setBusy(false);
    }
  }
  async function next() {
    if (busy) return;
    setError(undefined);
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      await saveVehicle(
        parseVehicle(
          {
            schemaVersion: 1,
            ownerId: uid,
            type,
            color,
            photoBase64: photo,
            plate,
            plateRegion: region,
          },
          uid,
        ),
      );
      onDone();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save your vehicle. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  const valid =
    step < 0
      ? true
      : step === 0
        ? !!type.trim() && !!color.trim()
        : step === 1
          ? !!photo
          : !!plate.trim() && !!region.trim();
  return (
    <FlowStep
      title={
        step < 0
          ? 'Your commute is ready. Add your vehicle?'
          : [
              'Tell us about your car',
              'Add a photo of your car',
              'What’s your license plate?',
            ][step]
      }
      subtitle={
        step < 0
          ? 'One more part of onboarding for drivers: car details, a photo, and your plate. You can do this later and browse first.'
          : [
              'Add these details before connecting as a driver. You can finish later and still browse matches.',
              'Choose a clear photo of the car you’ll use.',
              'Saved privately for future vehicle checks. These details are self-reported; no verification is performed in this demo.',
            ][step]
      }
      progress={step < 0 ? undefined : { from: step / 3, to: (step + 1) / 3 }}
      leading={step <= 0 ? 'close' : 'back'}
      onLeadingPress={() => {
        if (!busy) {
          if (step > 0) setStep(step - 1);
          else onSkip();
        }
      }}
      canContinue={valid && !busy}
      continueLabel={
        step < 0
          ? 'Add my vehicle'
          : busy
            ? 'Saving…'
            : step === 2
              ? 'Save vehicle'
              : 'Continue'
      }
      onContinue={() => void next()}
      footerNote={
        <AppButton
          label="Do this later"
          disabled={busy}
          variant="secondary"
          onPress={onSkip}
        />
      }
    >
      {step === 0 && (
        <>
          <TextField
            label="Make, model or car type"
            placeholder="e.g. Toyota Corolla, sedan"
            value={type}
            maxLength={80}
            onChangeText={setType}
          />
          <TextField
            label="Color"
            placeholder="e.g. Blue"
            value={color}
            maxLength={40}
            onChangeText={setColor}
          />
        </>
      )}
      {step === 1 && (
        <>
          {photo ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${photo}` }}
              style={{ height: 220, width: '100%', borderRadius: 16 }}
              resizeMode="contain"
            />
          ) : null}
          <AppButton
            label={
              busy
                ? 'Preparing photo…'
                : photo
                  ? 'Change photo'
                  : 'Choose car photo'
            }
            disabled={busy}
            variant="secondary"
            onPress={() => void pickPhoto()}
          />
          <Text>
            Your photo stays with your private vehicle record in this local
            demo.
          </Text>
        </>
      )}
      {step === 2 && (
        <>
          <TextField
            label="License plate"
            value={plate}
            maxLength={16}
            onChangeText={setPlate}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TextField
            label="State / registration region"
            placeholder="e.g. New York"
            value={region}
            maxLength={40}
            onChangeText={setRegion}
          />
        </>
      )}
      {error && <Text accessibilityRole="alert">{error}</Text>}
    </FlowStep>
  );
}
