import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import {
  SaveCoordinator,
  SavePendingError,
  saveErrorMessage,
} from '../persistence/saveCoordinator';
import { colors, spacing } from '../theme';
import { saveMatchingSetup, searchMatchingDrivers, watchMatchingSetup } from './client';
import {
  CAMPUS_POINTS,
  PUBLIC_POINTS,
  PICKUP_SERVICE_SECONDS,
  commuteKey,
  enabledDays,
  localDateAt,
  parseMatchingSetup,
  setupMatchesCommute,
  type MatchingSetup,
} from './settings';
import type { MatchResponse } from './service';
import { createOsrmRoutingAdapter } from '../routing/osrmAdapter';
import type { RoadRoute } from '../routing/types';
import { RouteMap } from '../routing/components/RouteMap';

function clock(minute: number) {
  return `${Math.floor(minute / 60)
    .toString()
    .padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
}
function minute(text: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error('Enter times as HH:MM (24 hour).');
  const [hour, min] = text.split(':').map(Number);
  return hour * 60 + min;
}
function count(text: string) {
  if (!/^\d+$/.test(text)) throw new Error('Enter nonnegative whole numbers.');
  return Number(text);
}
interface Form {
  mode: 'driver' | 'rider';
  pointId: string;
  enabled: boolean;
  earliest: string;
  latest: string;
  arrivalEarliest: string;
  arrivalLatest: string;
  seats: string;
  detour: string;
  extraRide: string;
  access: string;
  egress: string;
  maxAccess: string;
  maxEgress: string;
}
const blank: Form = {
  mode: 'rider',
  pointId: '',
  enabled: false,
  earliest: '',
  latest: '',
  arrivalEarliest: '',
  arrivalLatest: '',
  seats: '1',
  detour: '',
  extraRide: '',
  access: '',
  egress: '',
  maxAccess: '',
  maxEgress: '',
};
function formFrom(setup: MatchingSetup): Form {
  return {
    mode: setup.mode,
    pointId: setup.pointId,
    enabled: setup.active && setup.optIn,
    earliest: clock(setup.startWindow.earliest),
    latest: clock(setup.startWindow.latest),
    arrivalEarliest: clock(setup.arrivalWindow.earliest),
    arrivalLatest: clock(setup.arrivalWindow.latest),
    seats: String(setup.seatsRequested),
    detour: String(setup.maxDetourSeconds / 60),
    extraRide: String(setup.maxExtraRideSeconds / 60),
    access: String(setup.accessWalkSeconds / 60),
    egress: String(setup.egressWalkSeconds / 60),
    maxAccess: String(setup.maxAccessWalkSeconds / 60),
    maxEgress: String(setup.maxEgressWalkSeconds / 60),
  };
}
function MatchingContent({ initialDate }: { initialDate?: string }) {
  const { user, commute, profile, retry } = useSession();
  const [form, setForm] = useState<Form>(blank);
  const formRef = useRef<Form>(blank);
  const pendingForm = useRef<string | null>(null);
  const [saved, setSaved] = useState<MatchingSetup | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [preview, setPreview] = useState<RoadRoute | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [localDate, setLocalDate] = useState(() => initialDate ?? localDateAt(Date.now() / 1000));
  const generation = useRef(0);
  const previewController = useRef<AbortController | null>(null);
  const saves = useRef(new SaveCoordinator());
  const pendingRevision = useRef<string | null>(null);
  const uid = user?.id;
  const basis = commute ? commuteKey(commute) : '';
  useEffect(() => {
    if (!uid) return;
    const stop = watchMatchingSetup(
      uid,
      (setup) => {
        setSaved(setup);
        setLoaded(true);
        generation.current++;
        setResult(null);
        setSearching(false);
        setPreview(null);
        if (setup) {
          const acknowledged = pendingRevision.current === setup.revision;
          const unchangedSinceSave = pendingForm.current === JSON.stringify(formRef.current);
          if (!dirtyRef.current || (acknowledged && unchangedSinceSave)) {
            const next = formFrom(setup);
            formRef.current = next;
            setForm(next);
            setDirty(false);
            dirtyRef.current = false;
          }
          if (acknowledged) {
            pendingRevision.current = null;
            pendingForm.current = null;
            setError(null);
            setNotice('Matching setup saved.');
          }
        }
      },
      (caught) => {
        setError(caught.message);
        setLoaded(true);
      },
    );
    const controller = previewController;
    return () => {
      stop();
      controller.current?.abort();
    };
  }, [uid]);
  const change = <K extends keyof Form>(key: K, value: Form[K]) => {
    generation.current++;
    setSearching(false);
    setResult(null);
    setPreview(null);
    previewController.current?.abort();
    dirtyRef.current = true;
    setDirty(true);
    setNotice(null);
    const next = { ...formRef.current, [key]: value };
    formRef.current = next;
    setForm(next);
  };
  const current = saved && commute && profile && setupMatchesCommute(saved, commute, profile.role);
  const save = async () => {
    if (!commute || !uid || !profile || saving) return;
    setError(null);
    setNotice(null);
    try {
      const revision =
        pendingRevision.current ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const next = parseMatchingSetup(
        {
          schemaVersion: 1,
          ownerId: uid,
          revision,
          commuteKey: basis,
          mode: form.mode,
          active: form.enabled,
          optIn: form.enabled,
          campusLot: commute.campusLot,
          weekdays: enabledDays(commute, form.mode),
          pointId: form.pointId,
          startWindow: { earliest: minute(form.earliest), latest: minute(form.latest) },
          arrivalWindow: {
            earliest: minute(form.arrivalEarliest),
            latest: minute(form.arrivalLatest),
          },
          seatsRequested: form.mode === 'rider' ? count(form.seats) : 1,
          maxDetourSeconds: form.mode === 'driver' ? count(form.detour) * 60 : 0,
          maxExtraRideSeconds: form.mode === 'rider' ? count(form.extraRide) * 60 : 0,
          accessWalkSeconds: form.mode === 'rider' ? count(form.access) * 60 : 0,
          egressWalkSeconds: form.mode === 'rider' ? count(form.egress) * 60 : 0,
          maxAccessWalkSeconds: form.mode === 'rider' ? count(form.maxAccess) * 60 : 0,
          maxEgressWalkSeconds: form.mode === 'rider' ? count(form.maxEgress) * 60 : 0,
        },
        uid,
      );
      if (
        !setupMatchesCommute(next, commute, profile.role) ||
        (next.mode === 'driver' && !commute.seats)
      )
        throw new Error(
          'Use your saved role, inbound days and arrival deadlines. Drivers need saved passenger seats.',
        );
      if (!pendingRevision.current) pendingForm.current = JSON.stringify(formRef.current);
      pendingRevision.current = revision;
      setSaving(true);
      await saves.current.run(JSON.stringify(next), () => saveMatchingSetup(next));
      setNotice('Matching setup saved. Searches use these saved settings.');
    } catch (caught) {
      if (!(caught instanceof SavePendingError)) {
        pendingRevision.current = null;
        pendingForm.current = null;
      }
      setError(
        saveErrorMessage(
          caught,
          caught instanceof Error ? caught.message : 'Could not save. Retry when connected.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };
  const search = async () => {
    if (!saved || dirty || !current) return;
    const version = ++generation.current;
    setSearching(true);
    setResult(null);
    setError(null);
    setPreview(null);
    try {
      const response = await searchMatchingDrivers(localDate, saved.revision);
      if (version === generation.current) setResult(response);
    } catch (caught) {
      if (version === generation.current)
        setError(caught instanceof Error ? caught.message : 'Matching is unavailable. Retry.');
    } finally {
      if (version === generation.current) setSearching(false);
    }
  };
  const showPreview = async () => {
    if (!saved || !result || previewing) return;
    const version = generation.current;
    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    setPreviewing(true);
    setError(null);
    const point = PUBLIC_POINTS.find((p) => p.id === saved.pointId)!;
    const campus = CAMPUS_POINTS.find((p) => p.id === saved.campusLot)!;
    try {
      const route = await createOsrmRoutingAdapter({
        baseUrl: process.env.EXPO_PUBLIC_OSRM_BASE_URL,
      }).route([point.coordinate, campus.coordinate], { signal: controller.signal });
      if (version !== generation.current) return;
      if (route.status === 'SUCCESS') setPreview(route.route);
      else setError('Map preview unavailable. The matching result above is still available.');
    } finally {
      setPreviewing(false);
    }
  };
  const field = (
    label: string,
    key: keyof Omit<Form, 'mode' | 'pointId' | 'enabled'>,
    numeric = true,
  ) => (
    <TextField
      key={key}
      label={label}
      value={form[key]}
      onChangeText={(value) => change(key, value)}
      keyboardType={numeric ? 'number-pad' : 'numbers-and-punctuation'}
    />
  );
  const time = (epoch: number) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
    }).format(epoch * 1000);
  return (
    <Screen
      title="Commute matching"
      eyebrow="TO CAMPUS"
      subtitle="Real saved accounts · one driver and one rider · New York time"
    >
      {!commute ? (
        <Card>
          <Text>Save your commute before setting up matching.</Text>
          <AppButton label="Set up commute" onPress={() => router.push('/commute-setup')} />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={styles.heading}>Matching setup</Text>
            <Text>
              Choose a public point you can use. Your approximate area is not an exact routing
              location.
            </Text>
            {!loaded && <Text>Loading your saved matching setup…</Text>}
            {loaded && !current && (
              <Text>Complete or reconfirm matching setup for your current commute.</Text>
            )}
            <AppButton
              label="Edit saved commute"
              variant="secondary"
              onPress={() => router.push('/commute-setup')}
            />
            {commute.campusLot === 'other' ? (
              <Text>
                Select a supported campus drop-off in your commute before enabling matching.
              </Text>
            ) : (
              <Text>
                Campus drop-off:{' '}
                {CAMPUS_POINTS.find((point) => point.id === commute.campusLot)?.label}
              </Text>
            )}
            <View style={styles.row}>
              {(['driver', 'rider'] as const).map((mode) => (
                <AppButton
                  key={mode}
                  label={`${form.mode === mode ? '✓ ' : ''}${mode === 'driver' ? 'Driving' : 'Riding'}`}
                  variant="secondary"
                  onPress={() => change('mode', mode)}
                />
              ))}
            </View>
            <Text>
              Inbound days:{' '}
              {enabledDays(commute, form.mode).join(', ') || 'None — update your commute'}. This
              selection resolves “either” days.
            </Text>
            {PUBLIC_POINTS.map((point) => (
              <AppButton
                key={point.id}
                label={`${point.id === form.pointId ? '✓ ' : ''}${point.label}`}
                variant="secondary"
                onPress={() => change('pointId', point.id)}
              />
            ))}
            {field(
              form.mode === 'driver'
                ? 'Earliest departure (HH:MM)'
                : 'Earliest ready at pickup (HH:MM)',
              'earliest',
              false,
            )}
            {field(
              form.mode === 'driver' ? 'Latest departure (HH:MM)' : 'Latest pickup (HH:MM)',
              'latest',
              false,
            )}
            {field('Earliest campus arrival (HH:MM)', 'arrivalEarliest', false)}
            {field('Latest campus arrival (HH:MM)', 'arrivalLatest', false)}
            {form.mode === 'driver' ? (
              <>
                {field('Maximum added driving time (minutes)', 'detour')}
                <Text>Passenger seats: {commute.seats ?? 'Set seats in your commute'}</Text>
              </>
            ) : (
              <>
                {field('Passenger seats needed', 'seats')}
                {field('Maximum extra in-vehicle time (minutes)', 'extraRide')}
                {field('Your walk to the public pickup (minutes)', 'access')}
                {field('Maximum walk to pickup (minutes)', 'maxAccess')}
                {field('Your campus walk after drop-off (minutes)', 'egress')}
                {field('Maximum campus walk (minutes)', 'maxEgress')}
              </>
            )}
            <Text>
              Boarding allowance: {PICKUP_SERVICE_SECONDS / 60} minutes. Departures prefer the
              earliest feasible time. Enter 0 for a walk only when no walking is needed. These
              windows apply to your listed inbound days.
            </Text>
            <View style={styles.row}>
              <Switch
                accessibilityLabel="Enable matching and discovery"
                value={form.enabled}
                onValueChange={(value) => change('enabled', value)}
              />
              <Text>Enable matching and discovery</Text>
            </View>
            <Text>
              Enabled drivers may appear to verified campus riders. Seats are informational; this
              MVP does not reserve rides.
            </Text>
            <AppButton
              label={saving ? 'Saving…' : 'Save matching setup'}
              onPress={() => void save()}
              disabled={saving || !loaded}
            />
          </Card>
          {saved?.mode === 'driver' && current && !dirty && (
            <Card>
              <Text>
                Your {saved.active && saved.optIn ? 'enabled' : 'disabled'} driver setup is saved.
                Eligible riders can discover you after the matching service is configured.
              </Text>
            </Card>
          )}
          <Card>
            <Text style={styles.heading}>Find compatible drivers</Text>
            <TextField
              label="Date (YYYY-MM-DD, next 30 days)"
              value={localDate}
              onChangeText={(date) => {
                generation.current++;
                setSearching(false);
                setLocalDate(date);
                setResult(null);
                setPreview(null);
                previewController.current?.abort();
              }}
            />
            <AppButton
              label={searching ? 'Finding drivers…' : 'Find drivers'}
              disabled={
                searching ||
                saving ||
                dirty ||
                !current ||
                saved?.mode !== 'rider' ||
                !saved.active ||
                !saved.optIn
              }
              onPress={() => void search()}
            />
            {searching && (
              <AppButton
                label="Cancel search"
                variant="secondary"
                onPress={() => {
                  generation.current++;
                  setSearching(false);
                  setNotice('Search cancelled. You can retry.');
                }}
              />
            )}
            {dirty && <Text>Save your changes before searching.</Text>}
          </Card>
        </>
      )}
      {error && (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
          <AppButton
            label="Reload saved account"
            variant="secondary"
            disabled={saving}
            onPress={() => void retry()}
          />
        </View>
      )}
      {notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
      {result && (
        <>
          <Text>
            Evaluated{' '}
            {new Date(result.evaluatedAt * 1000).toLocaleString('en-US', {
              timeZone: result.timeZone,
            })}
            . Road estimates are not live traffic.
          </Text>
          {result.recommendations.length === 0 && (
            <Card>
              <Text>
                {result.unknownCount > 0
                  ? 'No confirmed match yet. Some estimates or inputs were unavailable; retry your search.'
                  : 'No compatible drivers found for this date and setup.'}
              </Text>
            </Card>
          )}
          {result.recommendations.map((item, index) => (
            <Card key={item.driverId}>
              <Text style={styles.heading}>
                #{index + 1} {item.firstName} · {item.score}/100
              </Text>
              <Text>
                {item.approximateArea} · {item.seatsAvailable} passenger seats
              </Text>
              <Text>
                Pickup {time(item.plan.pickup)} · Campus arrival{' '}
                {time(item.plan.riderDestinationArrival)}
              </Text>
              <Text>
                Added driving time: {Math.ceil(item.metrics.driverExtraDurationSeconds / 60)}{' '}
                minutes
              </Text>
              {item.explanations.map((explanation, i) => (
                <Text key={i}>{explanation}</Text>
              ))}
            </Card>
          ))}
          <Text>
            {result.incompatibleCount} evaluated pairs did not fit. {result.unknownCount} could not
            be confirmed.
          </Text>
          {result.candidateLimitReached && (
            <Text>This search covered the first 30 candidate setups. More drivers may exist.</Text>
          )}
          {result.recommendations.length > 0 && (
            <AppButton
              label={previewing ? 'Loading preview…' : 'Preview public pickup to campus'}
              variant="secondary"
              disabled={previewing}
              onPress={() => void showPreview()}
            />
          )}
          {preview && saved && (
            <RouteMap
              start={PUBLIC_POINTS.find((point) => point.id === saved.pointId)!.coordinate}
              destination={CAMPUS_POINTS.find((point) => point.id === saved.campusLot)!.coordinate}
              route={preview}
              selection="start"
              onSelectCoordinate={() => {}}
            />
          )}
        </>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 19, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  error: { color: colors.error },
});

// Remount on account/commute changes rather than copying derived session state in an effect.
export function MatchingScreen({ initialDate }: { initialDate?: string }) {
  const { user, commute, profile } = useSession();
  return (
    <MatchingContent
      key={JSON.stringify([user?.id, commute, profile?.role])}
      initialDate={initialDate}
    />
  );
}
