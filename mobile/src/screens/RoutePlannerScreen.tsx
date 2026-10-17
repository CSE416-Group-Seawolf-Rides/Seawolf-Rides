import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { LatestRouteRequest } from '../routing/latestRouteRequest';
import { createOsrmRoutingAdapter } from '../routing/osrmAdapter';
import { routePresets } from '../routing/routePresets';
import { RouteMap, type EndpointSelection } from '../routing/components/RouteMap';
import type { RoadRoute, RouteCoordinate, RoutingResult } from '../routing/types';
import { colors, radii, spacing } from '../theme';

interface RoutePlannerScreenProps {
  onBack: () => void;
}

const failureCopy: Record<Exclude<RoutingResult, { status: 'SUCCESS' }>['code'], string> = {
  INVALID_COORDINATES: 'One or more selected coordinates are invalid.',
  INSUFFICIENT_WAYPOINTS: 'Select both a start and destination.',
  NO_ROUTE: 'The provider explicitly reported no driving route between these points.',
  NETWORK_ERROR: 'The routing service could not be reached. Check the connection and retry.',
  TIMEOUT: 'The routing service took too long to respond. Retry when ready.',
  CONFIGURATION_ERROR: 'The routing provider configuration is invalid.',
  PROVIDER_ERROR: 'The routing provider returned an error.',
  MALFORMED_RESPONSE: 'The routing provider returned route data this app could not safely use.',
  CANCELLED: 'The route request was cancelled.',
};

function formatCoordinate(coordinate: RouteCoordinate | null): string {
  return coordinate
    ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`
    : 'Not selected';
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.round(meters)} m` : `${miles.toFixed(1)} mi`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export function RoutePlannerScreen({ onBack }: RoutePlannerScreenProps) {
  const adapter = useMemo(() => createOsrmRoutingAdapter(), []);
  const latestRequest = useRef(new LatestRouteRequest());
  const [selection, setSelection] = useState<EndpointSelection>('start');
  const [start, setStart] = useState<RouteCoordinate | null>(null);
  const [destination, setDestination] = useState<RouteCoordinate | null>(null);
  const [result, setResult] = useState<RoutingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('Select a start point, then a destination.');

  useEffect(() => () => latestRequest.current.cancel(), []);

  const clearPreviousRoute = (message: string) => {
    latestRequest.current.cancel();
    setLoading(false);
    setResult(null);
    setNotice(message);
  };

  const setEndpoint = (coordinate: RouteCoordinate) => {
    clearPreviousRoute('Endpoint changed. Get a new route when both points are ready.');
    if (selection === 'start') {
      setStart({ ...coordinate });
      setSelection('destination');
    } else {
      setDestination({ ...coordinate });
    }
  };

  const swapEndpoints = () => {
    if (!start || !destination) return;
    clearPreviousRoute('Endpoints swapped. Get a new route to update the road path.');
    setStart({ ...destination });
    setDestination({ ...start });
  };

  const getRoute = async () => {
    if (!start || !destination) return;
    setLoading(true);
    setResult(null);
    setNotice('Requesting a driving route…');
    const response = await latestRequest.current.run(adapter, [start, destination]);
    if (response.status === 'STALE') return;
    setLoading(false);
    setResult(response.result);
    setNotice(
      response.result.status === 'SUCCESS'
        ? 'Road route loaded.'
        : failureCopy[response.result.code],
    );
  };

  const cancelRequest = () => {
    latestRequest.current.cancel();
    setLoading(false);
    setNotice('Route request cancelled.');
  };

  const route: RoadRoute | null = result?.status === 'SUCCESS' ? result.route : null;

  return (
    <Screen
      eyebrow="DEVELOPMENT TOOL"
      onBack={onBack}
      subtitle="Choose two public test points and request an estimated driving route."
      title="Route Planner"
    >
      <Card style={styles.instructionsCard}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          {selection === 'start' ? 'Selecting start' : 'Selecting destination'}
        </Text>
        <Text style={styles.bodyText}>
          Tap the map or a preset. Tapped locations may be snapped to a nearby routable road.
        </Text>
        <View accessibilityRole="tablist" style={styles.segmented}>
          {(['start', 'destination'] as const).map((value) => {
            const selected = selection === value;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={value}
                onPress={() => setSelection(value)}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                  {value === 'start' ? 'Select start' : 'Select destination'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <RouteMap
        destination={destination}
        onSelectCoordinate={setEndpoint}
        route={route}
        selection={selection}
        start={start}
      />

      <Card style={styles.cardGap}>
        <Text accessibilityRole="header" style={styles.cardTitle}>Public-location presets</Text>
        <Text style={styles.bodyText}>A preset replaces the endpoint currently being selected.</Text>
        <ScrollView
          contentContainerStyle={styles.presetRow}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {routePresets.map((preset) => (
            <Pressable
              accessibilityHint={`Use as ${selection}`}
              accessibilityRole="button"
              key={preset.id}
              onPress={() => setEndpoint(preset.coordinate)}
              style={({ pressed }) => [styles.preset, pressed && styles.presetPressed]}
            >
              <Text style={styles.presetText}>{preset.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Card>

      <Card style={styles.cardGap}>
        <EndpointRow color={colors.success} label="Start" value={formatCoordinate(start)} />
        <EndpointRow color={colors.error} label="Destination" value={formatCoordinate(destination)} />
        <AppButton
          disabled={!start || !destination || loading}
          label="Swap start and destination"
          onPress={swapEndpoints}
          variant="secondary"
        />
        <AppButton
          disabled={!start || !destination || loading}
          label={result?.status === 'FAILURE' ? 'Retry route' : 'Get route'}
          onPress={getRoute}
        />
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text accessibilityLiveRegion="polite" style={styles.statusText}>Getting route…</Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={cancelRequest}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        )}
        {!loading && <Text accessibilityLiveRegion="polite" style={styles.statusText}>{notice}</Text>}
      </Card>

      {result?.status === 'FAILURE' && (
        <Card style={styles.errorCard}>
          <Text accessibilityRole="header" style={styles.errorTitle}>{result.code.replaceAll('_', ' ')}</Text>
          <Text style={styles.bodyText}>{failureCopy[result.code]}</Text>
          {result.message !== failureCopy[result.code] && (
            <Text style={styles.technicalText}>{result.message}</Text>
          )}
          <Text style={styles.technicalText}>{result.retryable ? 'Retryable failure' : 'Retrying unchanged inputs is unlikely to help'}</Text>
        </Card>
      )}

      {route && (
        <Card style={styles.cardGap}>
          <Text accessibilityRole="header" style={styles.cardTitle}>Route result</Text>
          <MetricRow label="Distance" value={formatDistance(route.distanceMeters)} />
          <MetricRow label="Estimated duration" value={formatDuration(route.durationSeconds)} />
          <MetricRow label="Provider" value={route.provider.name} />
          <Text style={styles.providerNote}>No live traffic or departure-time prediction is included.</Text>
          <View style={styles.divider} />
          <Text accessibilityRole="header" style={styles.subheading}>Provider-snapped waypoints</Text>
          {route.snappedWaypoints.map((waypoint, index) => (
            <View key={`waypoint-${index}`} style={styles.waypoint}>
              <Text style={styles.waypointTitle}>{index === 0 ? 'Start' : index === route.snappedWaypoints.length - 1 ? 'Destination' : `Waypoint ${index + 1}`}</Text>
              <Text style={styles.technicalText}>Selected: {formatCoordinate(waypoint.input)}</Text>
              <Text style={styles.technicalText}>Snapped: {formatCoordinate(waypoint.snapped)}</Text>
              <Text style={styles.technicalText}>Snap distance: {waypoint.distanceMeters.toFixed(1)} m{waypoint.name ? ` · ${waypoint.name}` : ''}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function EndpointRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.endpointRow}>
      <Ionicons color={color} name="location" size={22} />
      <View style={styles.endpointCopy}>
        <Text style={styles.endpointLabel}>{label}</Text>
        <Text selectable style={styles.coordinate}>{value}</Text>
      </View>
    </View>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  instructionsCard: { gap: spacing.md },
  cardGap: { gap: spacing.md },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  bodyText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  segmented: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, flexDirection: 'row', padding: 3 },
  segment: { alignItems: 'center', borderRadius: radii.sm, flex: 1, minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.sm },
  segmentSelected: { backgroundColor: colors.text },
  segmentText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  segmentTextSelected: { color: colors.surface },
  presetRow: { gap: spacing.sm },
  preset: { borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: spacing.lg },
  presetPressed: { backgroundColor: colors.accentSoft },
  presetText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  endpointRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  endpointCopy: { flex: 1, gap: 2 },
  endpointLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  coordinate: { color: colors.textMuted, fontSize: 13 },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  statusText: { color: colors.textMuted, flex: 1, fontSize: 13, lineHeight: 18 },
  cancelText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  errorCard: { backgroundColor: colors.errorSoft, borderColor: colors.error, gap: spacing.sm },
  errorTitle: { color: colors.error, fontSize: 16, fontWeight: '800' },
  technicalText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  metricRow: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  metricLabel: { color: colors.textMuted, fontSize: 14 },
  metricValue: { color: colors.text, fontSize: 15, fontWeight: '800', textAlign: 'right' },
  providerNote: { color: colors.warning, fontSize: 13, lineHeight: 18 },
  divider: { backgroundColor: colors.border, height: 1 },
  subheading: { color: colors.text, fontSize: 15, fontWeight: '800' },
  waypoint: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: 2, padding: spacing.md },
  waypointTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
});
