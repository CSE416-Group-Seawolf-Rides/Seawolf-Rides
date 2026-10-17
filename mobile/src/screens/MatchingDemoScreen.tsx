import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { DetailRow } from '../components/DetailRow';
import { ChoiceCard } from '../components/flow/ChoiceCard';
import { Screen } from '../components/Screen';
import { createMatchingDemoScenarios } from '../matching/demoScenarios';
import { evaluatePair } from '../matching/evaluatePair';
import type {
  InfeasibleReasonCode,
  PairEvaluation,
  PairEvaluationInput,
  StaticRouteEstimate,
  TimeWindow,
  UnknownReasonCode,
} from '../matching/types';
import { StatusPill } from '../rides/components/StatusPill';
import { colors, spacing } from '../theme';

type ReasonCode = InfeasibleReasonCode | UnknownReasonCode;

interface MatchingDemoScreenProps {
  onBack: () => void;
}

const reasonExplanations: Record<ReasonCode, string> = {
  SELF_MATCH: 'A person cannot be matched with themself.',
  OCCURRENCE_MISMATCH: 'The driver and rider are not requesting the same dated trip.',
  SKIPPED_OCCURRENCE: 'The driver or rider has skipped this occurrence.',
  ROLE_CONFLICT: 'A precomputed driver or rider role conflict blocks this trip.',
  COMMITMENT_CONFLICT: 'An existing commitment conflicts with this trip.',
  NO_SEAT: 'The driver does not have enough remaining passenger seats.',
  NO_ROAD_ROUTE: 'The supplied travel data explicitly marks a required road leg unreachable.',
  WALK_LIMIT: 'The rider’s supplied walking duration exceeds an explicit walking limit.',
  DRIVER_DETOUR_LIMIT: 'The added driver duration exceeds the active detour limit.',
  RIDER_RIDE_LIMIT: 'The rider’s extra in-vehicle duration exceeds their limit.',
  NO_FEASIBLE_DEPARTURE: 'No departure time satisfies every pickup and arrival window.',
  UNSUPPORTED_DIRECTION: 'This evaluator does not yet support trips from campus.',
  LOCATION_UNCONFIRMED: 'A routing anchor is approximate, so a precise plan cannot be claimed.',
  MISSING_TRAVEL_ESTIMATE: 'A required travel estimate was not supplied.',
  MALFORMED_USER_ID: 'A driver or rider identifier is invalid.',
  MALFORMED_OCCURRENCE: 'The dated occurrence is invalid.',
  MALFORMED_WINDOW: 'A time window or preferred departure is invalid.',
  MALFORMED_COORDINATE: 'A routing coordinate is invalid.',
  MALFORMED_SEAT_COUNT: 'A remaining or requested seat count is invalid.',
  MALFORMED_DURATION: 'A supplied duration is invalid.',
  MALFORMED_LIMIT: 'A detour limit is invalid.',
  MALFORMED_FACTS: 'The precomputed occurrence facts are incomplete or invalid.',
  MALFORMED_TRAVEL_ESTIMATE: 'A supplied travel estimate is invalid.',
  ZERO_BASELINE_PERCENTAGE_LIMIT:
    'A percentage detour limit cannot be evaluated against a zero-duration baseline.',
  INCONSISTENT_TRAVEL_ESTIMATES:
    'The supplied legs imply a shared trip shorter than the solo baseline.',
};

export function MatchingDemoScreen({ onBack }: MatchingDemoScreenProps) {
  const [scenarios] = useState(createMatchingDemoScenarios);
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const [result, setResult] = useState<PairEvaluation | null>(null);
  const selected = scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0];

  function runEvaluation() {
    const next = evaluatePair(selected.input);
    setResult(next);
    AccessibilityInfo.announceForAccessibility(`Matching evaluation result: ${next.status}`);
  }

  return (
    <Screen
      eyebrow="DEVELOPER TOOL"
      onBack={onBack}
      subtitle="Demo — supplied travel times; no live routing."
      title="Matching Demo"
    >
      <Card style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Fixture time zone</Text>
        <Text style={styles.noticeText}>{selected.timeZoneLabel}</Text>
        <Text style={styles.noticeText}>
          Every displayed clock time is formatted in {selected.timeZone}, independent of the device
          time zone.
        </Text>
      </Card>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Choose a scenario
        </Text>
        {scenarios.map((scenario) => (
          <ChoiceCard
            description={scenario.description}
            key={scenario.id}
            onPress={() => {
              setSelectedId(scenario.id);
              setResult(null);
            }}
            selected={scenario.id === selected.id}
            title={scenario.title}
          />
        ))}
      </View>

      <InputSummary input={selected.input} timeZone={selected.timeZone} />

      <AppButton
        accessibilityLabel={`Run evaluation for ${selected.title}`}
        label="Run evaluation"
        onPress={runEvaluation}
      />

      {result && <EvaluationResult result={result} timeZone={selected.timeZone} />}
    </Screen>
  );
}

function InputSummary({ input, timeZone }: { input: PairEvaluationInput; timeZone: string }) {
  const ratio = input.driver.maxExtraDurationRatio;
  const accuracy = [
    input.anchors.driverStart.accuracy,
    input.anchors.riderPickup.accuracy,
    input.anchors.campusDropoff.accuracy,
  ];

  return (
    <Card style={styles.cardContent}>
      <Text accessibilityRole="header" style={styles.cardTitle}>
        Supplied inputs
      </Text>
      <DetailRow
        label="Driver departure window"
        value={formatWindow(input.driver.departureWindow, timeZone)}
      />
      <DetailRow
        label="Driver campus-arrival window"
        value={formatWindow(input.driver.campusArrivalWindow, timeZone)}
      />
      <DetailRow
        label="Rider pickup window"
        value={formatWindow(input.rider.pickupWindow, timeZone)}
      />
      <DetailRow
        label="Rider destination-arrival window"
        value={formatWindow(input.rider.destinationArrivalWindow, timeZone)}
      />
      <DetailRow label="Solo S → C" value={formatEstimate(input.travel.startToCampus)} />
      <DetailRow label="Leg S → P" value={formatEstimate(input.travel.startToPickup)} />
      <DetailRow label="Leg P → C" value={formatEstimate(input.travel.pickupToCampus)} />
      <DetailRow
        label="Pickup service"
        value={formatDuration(input.pickupServiceSeconds)}
      />
      <DetailRow
        label="Access walking"
        value={`${formatDuration(input.rider.accessWalkSeconds)}; limit ${formatDuration(input.rider.maxAccessWalkSeconds)}`}
      />
      <DetailRow
        label="Egress walking"
        value={`${formatDuration(input.rider.egressWalkSeconds)}; limit ${formatDuration(input.rider.maxEgressWalkSeconds)}`}
      />
      <DetailRow
        label="Driver detour limits"
        value={`${formatDuration(input.driver.maxExtraDurationSeconds)} absolute${ratio === undefined ? '' : `; ${formatPercent(ratio)} of solo duration`}`}
      />
      <DetailRow
        label="Passenger seats"
        value={`${input.driver.seatsRemaining} remaining; ${input.rider.seatsRequested} requested`}
      />
      <DetailRow
        label="Routing-anchor accuracy"
        value={accuracy.every((value) => value === 'SELECTED_POINT') ? 'All selected points' : 'Includes an approximate area'}
      />
    </Card>
  );
}

function EvaluationResult({ result, timeZone }: { result: PairEvaluation; timeZone: string }) {
  const tone = result.status === 'FEASIBLE' ? 'success' : result.status === 'INFEASIBLE' ? 'warning' : 'neutral';

  return (
    <Card style={styles.cardContent}>
      <View accessibilityLiveRegion="polite" style={styles.resultHeader}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Evaluation result
        </Text>
        <StatusPill label={result.status} tone={tone} />
      </View>

      {result.status === 'FEASIBLE' ? (
        <>
          <DetailRow
            label="Feasible departure interval"
            value={formatWindow(result.plan.feasibleDepartureWindow, timeZone)}
          />
          <DetailRow label="Selected departure" value={formatEpoch(result.plan.departure, timeZone)} />
          <DetailRow label="Pickup" value={formatEpoch(result.plan.pickup, timeZone)} />
          <DetailRow
            label="Boarding complete"
            value={formatEpoch(result.plan.boardingComplete, timeZone)}
          />
          <DetailRow
            label="Vehicle campus arrival"
            value={formatEpoch(result.plan.vehicleCampusArrival, timeZone)}
          />
          <DetailRow
            label="Rider destination arrival"
            value={formatEpoch(result.plan.riderDestinationArrival, timeZone)}
          />
          <DetailRow
            label="Added driver duration"
            value={formatDuration(result.metrics.driverExtraDurationSeconds)}
          />
          <DetailRow
            label="Active detour limit"
            value={formatDuration(result.metrics.activeDriverDetourLimitSeconds)}
          />
        </>
      ) : (
        <View style={styles.reasons}>
          {result.reasonCodes.map((code) => (
            <View key={code} style={styles.reason}>
              <Text style={styles.reasonCode}>{humanizeCode(code)}</Text>
              <Text style={styles.reasonText}>{reasonExplanations[code]}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function formatEpoch(epochSeconds: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
    timeZone,
  }).format(new Date(epochSeconds * 1000));
}

function formatWindow(window: TimeWindow, timeZone: string): string {
  return `${formatEpoch(window.earliest, timeZone)}–${formatEpoch(window.latest, timeZone)}`;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) {
    return '0 minutes';
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) {
    return `${remainder} sec`;
  }
  return remainder === 0 ? `${minutes} min` : `${minutes} min ${remainder} sec`;
}

function formatEstimate(estimate: StaticRouteEstimate): string {
  if (estimate.status === 'MISSING') {
    return 'Missing';
  }
  if (estimate.status === 'UNREACHABLE') {
    return 'Explicitly unreachable';
  }
  return `${formatDuration(estimate.durationSeconds)} · ${estimate.distanceMeters.toLocaleString('en-US')} m`;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function humanizeCode(code: ReasonCode): string {
  return code
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  noticeCard: {
    backgroundColor: colors.accentSoft,
    gap: spacing.xs,
  },
  noticeTitle: {
    color: colors.accentDark,
    fontSize: 15,
    fontWeight: '800',
  },
  noticeText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  cardContent: {
    gap: spacing.lg,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  resultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  reasons: {
    gap: spacing.md,
  },
  reason: {
    gap: spacing.xs,
  },
  reasonCode: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  reasonText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
