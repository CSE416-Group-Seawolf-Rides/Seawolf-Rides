import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useSession } from '../auth/SessionProvider';
import type { Weekday } from '../commute/commuteModel';
import { createOsrmRoutingAdapter } from '../routing/osrmAdapter';
import { SharedLiveDirectedTravelSource, type TravelCacheOwnership } from '../routing/directedTravelSource';
import { validateDatedRideProposal, type DatedRideProposalV1 } from './datedRideProposal';
import { GroupAcceptanceService, MultiCarScenarioStore, type GroupAcceptanceCode } from './groupAcceptance';
import { applyFridayDriverTestLoad, buildFridayDriverTest, createFridayGroupStoreData, FRIDAY_DRIVER_TEST_OCCURRENCE_ID, isFridayDriverTestRequest, resetFridayDriverTestState } from './fridayDriverTest';
import type { GroupRoutePlanV1 } from './groupRideContracts';
import { driverOfferFixtures } from './rideFixtures';
import {
  IncomingRequest,
  OutgoingRequest,
  type DriverOccurrenceOverride,
  reconcileRideState,
  reconcileSkippedDays,
  sharedDrivingDays,
} from './rideModel';
import {
  createDatedOutgoingRequest,
  transitionIncomingRequest,
  type RequestTransitionCode,
} from './requestTransitions';

interface Rides {
  outgoing: OutgoingRequest[];
  incoming: IncomingRequest[];
  sendRequest: (offerId: string, days: Weekday[]) => void;
  sendDatedRequest: (proposal: DatedRideProposalV1) => RequestTransitionCode;
  cancelRequest: (offerId: string) => void;
  withdrawRequest: (requestId: string) => void;
  respondToRequest: (requestId: string, status: 'accepted' | 'declined') => Promise<RequestResponseResult>;
  driverOccurrences: DriverOccurrenceOverride[];
  fridayDriverTest: { status: 'IDLE' | 'LOADING' | 'LOADED' | 'ERROR'; message: string | null };
  fridayAcceptedPlan: GroupRoutePlanV1 | null;
  loadFridayDriverTest: () => Promise<void>;
  resetFridayDriverTest: () => void;
  // Trip ids (local dates) the user can't make. The recurring match stays in place.
  skipped: string[];
  skipTrip: (tripId: string) => void;
  undoSkip: (tripId: string) => void;
}

export interface RequestResponseResult {
  ok: boolean;
  code: RequestTransitionCode | GroupAcceptanceCode;
  message: string;
}

const RidesContext = createContext<Rides | null>(null);

// Legacy development-screen state only. Real requests use the backend and RideRequestsScreen.
// No automatic simulated driver responses.
export function RidesProvider({ children }: PropsWithChildren) {
  const { user, commute } = useSession();
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [driverOccurrences, setDriverOccurrences] = useState<DriverOccurrenceOverride[]>([]);
  const [reconciledCommute, setReconciledCommute] = useState(commute);
  const [fridayDriverTest, setFridayDriverTest] = useState<Rides['fridayDriverTest']>({ status: 'IDLE', message: null });
  const [fridayAcceptedPlan, setFridayAcceptedPlan] = useState<GroupRoutePlanV1 | null>(null);
  const routeAdapter = useMemo(() => createOsrmRoutingAdapter(), []);
  const commuteRef = useRef(commute);
  const outgoingRef = useRef(outgoing);
  const incomingRef = useRef(incoming);
  const skippedRef = useRef(skipped);
  const driverOccurrencesRef = useRef(driverOccurrences);
  const fridayLoadController = useRef<AbortController | null>(null);
  const fridayGroupStore = useRef<MultiCarScenarioStore | null>(null);
  const fridayTravelSource = useRef<SharedLiveDirectedTravelSource | null>(null);
  const fridayRoutingOwnership = useRef<TravelCacheOwnership | null>(null);
  const groupAcceptance = useRef(new GroupAcceptanceService());

  useEffect(() => {
    commuteRef.current = commute;
  }, [commute]);

  useEffect(() => {
    outgoingRef.current = outgoing;
  }, [outgoing]);

  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  useEffect(() => {
    skippedRef.current = skipped;
  }, [skipped]);

  useEffect(() => {
    driverOccurrencesRef.current = driverOccurrences;
  }, [driverOccurrences]);

  useEffect(() => {
    return () => {
      fridayLoadController.current?.abort();
    };
  }, []);

  // Reconcile legacy development state before rendering a changed commute, without an effect cascade.
  if (commute !== reconciledCommute) {
    setReconciledCommute(commute);
    if (commute) {
      setOutgoing((current) => reconcileRideState(commute, current, []).outgoing);
      setIncoming((current) => reconcileRideState(commute, [], current, driverOccurrences).incoming);
      setSkipped((current) => reconcileSkippedDays(commute, current));
    }
  }

  const rides = useMemo<Rides>(
    () => ({
      outgoing,
      incoming,
      // Adds a request alongside any earlier ones with the same driver, so asking for
      // Friday never touches an already-confirmed Monday.
      sendRequest: (offerId, days) => {
        const allowedDays = commute
          ? days.filter(
              (day) =>
                !incomingRef.current.some(
                  (request) =>
                    request.status === 'accepted' &&
                    request.days.includes(day) &&
                    sharedDrivingDays(commute, request).includes(day),
                ),
            )
          : days;
        if (allowedDays.length === 0) {
          return;
        }
        const id = `request-${offerId}-${Date.now()}`;
        setOutgoing((current) => [
          ...current,
          { id, offerId, days: allowedDays, status: 'pending' },
        ]);
      },
      sendDatedRequest: (proposal) => {
        const nowEpochSeconds = Math.floor(Date.now() / 1000);
        const offer = driverOfferFixtures.find((candidate) => candidate.id === proposal.participants.offerId);
        const validation = validateDatedRideProposal(proposal, nowEpochSeconds);
        if (!validation.ok) return validation.code === 'OUTDATED_PROPOSAL' ? 'OUTDATED_PROPOSAL' : 'INVALID_PROPOSAL';
        if (!offer) return 'OFFER_CHANGED';
        const duplicate = outgoingRef.current.some((request) => (
          request.status !== 'declined'
          && request.proposal?.occurrence.localDate === proposal.occurrence.localDate
          && request.proposal.participants.riderId === proposal.participants.riderId
        ));
        if (duplicate) return 'DUPLICATE_COMMITMENT';
        const id = `request-${proposal.proposalId}-${Date.now()}`;
        const request = createDatedOutgoingRequest(proposal, id);
        const next = [...outgoingRef.current, request];
        outgoingRef.current = next;
        setOutgoing(next);
        return 'CREATED';
      },
      // Withdraws every request with this driver (a pending ask or the whole carpool).
      cancelRequest: (offerId) => {
        setOutgoing((current) => current.filter((request) => request.offerId !== offerId));
      },
      // Withdraws one pending ask, leaving other days with the same driver untouched.
      withdrawRequest: (requestId) => {
        setOutgoing((current) => current.filter((request) => request.id !== requestId));
      },
      respondToRequest: async (requestId, status) => {
        const request = incomingRef.current.find((item) => item.id === requestId);
        if (request?.proposal && isFridayDriverTestRequest(request)) {
          if (status === 'declined') {
            const transition = transitionIncomingRequest({
              commute: commuteRef.current, requests: incomingRef.current, outgoing: outgoingRef.current,
              requestId, status, nowEpochSeconds: Math.floor(Date.now() / 1000),
              driverOccurrences: driverOccurrencesRef.current,
            });
            if (transition.ok) {
              fridayGroupStore.current?.cancelPendingRequest(requestId);
              incomingRef.current = transition.requests;
              setIncoming(transition.requests);
            }
            return { ok: transition.ok, code: transition.code, message: requestTransitionMessage(transition.code) };
          }
          const store = fridayGroupStore.current;
          const source = fridayTravelSource.current;
          const routingOwnership = fridayRoutingOwnership.current;
          if (!store || !source || !routingOwnership) {
            return { ok: false, code: 'LEGACY_INCOMPLETE', message: 'This dated request is missing its complete group acceptance context.' };
          }
          const result = await groupAcceptance.current.accept({
            store, requestId, source, routingOwnership,
            nowEpochSeconds: () => Math.floor(Date.now() / 1000),
          });
          if (result.ok) {
            const next = incomingRef.current.map((item) => item.id === requestId && item.status === 'pending'
              ? { ...item, status: 'accepted' as const }
              : item);
            incomingRef.current = next;
            setIncoming(next);
            setFridayAcceptedPlan(result.plan ?? null);
          }
          return { ok: result.ok, code: result.code, message: result.message };
        }
        const transition = transitionIncomingRequest({
          commute: commuteRef.current,
          requests: incomingRef.current,
          outgoing: outgoingRef.current,
          requestId,
          status,
          nowEpochSeconds: Math.floor(Date.now() / 1000),
          driverOccurrences: driverOccurrencesRef.current,
        });
        if (transition.ok) {
          incomingRef.current = transition.requests;
          setIncoming(transition.requests);
        }
        return { ok: transition.ok, code: transition.code, message: requestTransitionMessage(transition.code) };
      },
      driverOccurrences,
      fridayDriverTest,
      fridayAcceptedPlan,
      loadFridayDriverTest: async () => {
        if (!__DEV__ || !user || fridayLoadController.current) return;
        if (incomingRef.current.some(isFridayDriverTestRequest)) {
          setFridayDriverTest({ status: 'LOADED', message: 'Friday driver test is already loaded.' });
          return;
        }
        const controller = new AbortController();
        fridayLoadController.current = controller;
        setFridayDriverTest({ status: 'LOADING', message: 'Using live OSRM to evaluate Ava, Ben, and Chloe…' });
        try {
          const result = await buildFridayDriverTest({ adapter: routeAdapter, driverId: user.id, signal: controller.signal });
          if (controller.signal.aborted) return;
          if (result.status === 'FAILURE') {
            setFridayDriverTest({ status: 'ERROR', message: result.message });
            return;
          }
          const next = applyFridayDriverTestLoad(incomingRef.current, driverOccurrencesRef.current, result);
          const groupData = createFridayGroupStoreData(result);
          fridayGroupStore.current = new MultiCarScenarioStore(groupData);
          fridayTravelSource.current = new SharedLiveDirectedTravelSource({
            adapter: routeAdapter,
            rootGeneration: result.generationId,
          });
          fridayRoutingOwnership.current = {
            mode: 'LIVE', providerId: 'osrm', profile: 'driving', optionsKey: 'friday-driver-test',
            rootGeneration: result.generationId, estimateVersion: 'friday-live-v1',
          };
          setFridayAcceptedPlan(null);
          incomingRef.current = next.incoming;
          setIncoming(next.incoming);
          driverOccurrencesRef.current = next.occurrences;
          setDriverOccurrences(next.occurrences);
          setFridayDriverTest({ status: 'LOADED', message: '3 synthetic dated requests loaded for Friday, October 16.' });
        } catch (caught) {
          if (!controller.signal.aborted) setFridayDriverTest({ status: 'ERROR', message: caught instanceof Error ? caught.message : 'Friday driver test could not be loaded.' });
        } finally {
          if (fridayLoadController.current === controller) fridayLoadController.current = null;
        }
      },
      resetFridayDriverTest: () => {
        if (!__DEV__) return;
        fridayLoadController.current?.abort();
        fridayLoadController.current = null;
        const existingStore = fridayGroupStore.current;
        if (existingStore) {
          const existing = existingStore.snapshot();
          existingStore.replace({
            scenario: { ...existing.scenario, generationId: `${existing.scenario.generationId}:reset` },
            pendingProposals: [], skippedDriverOccurrenceIds: [], cancelledRequestIds: [],
          });
        }
        fridayTravelSource.current?.beginRootGeneration(`friday-reset-${Date.now()}`);
        fridayGroupStore.current = null;
        fridayTravelSource.current = null;
        fridayRoutingOwnership.current = null;
        setFridayAcceptedPlan(null);
        const next = resetFridayDriverTestState(incomingRef.current, driverOccurrencesRef.current);
        incomingRef.current = next.incoming;
        setIncoming(next.incoming);
        driverOccurrencesRef.current = next.occurrences;
        setDriverOccurrences(next.occurrences);
        setFridayDriverTest({ status: 'IDLE', message: null });
      },
      skipped,
      skipTrip: (tripId) => {
        if (tripId === FRIDAY_DRIVER_TEST_OCCURRENCE_ID || tripId === '2026-10-16') {
          fridayGroupStore.current?.setDriverSkipped(FRIDAY_DRIVER_TEST_OCCURRENCE_ID, true);
        }
        setSkipped((current) => (current.includes(tripId) ? current : [...current, tripId]));
      },
      undoSkip: (tripId) => {
        if (tripId === FRIDAY_DRIVER_TEST_OCCURRENCE_ID || tripId === '2026-10-16') {
          fridayGroupStore.current?.setDriverSkipped(FRIDAY_DRIVER_TEST_OCCURRENCE_ID, false);
        }
        setSkipped((current) => current.filter((id) => id !== tripId));
      },
    }),
    [commute, driverOccurrences, fridayAcceptedPlan, fridayDriverTest, incoming, outgoing, routeAdapter, skipped, user],
  );

  return <RidesContext.Provider value={rides}>{children}</RidesContext.Provider>;
}

function requestTransitionMessage(code: RequestTransitionCode): string {
  return ({
    ACCEPTED: 'The request was accepted.', DECLINED: 'The request was declined.',
    REQUEST_NOT_FOUND: 'The request no longer exists.', NOT_PENDING: 'The request is no longer pending.',
    LEGACY_RECURRING_REQUEST: 'This legacy recurring request does not have a complete dated agreement.',
    WRONG_OCCURRENCE: 'The request no longer matches this occurrence.',
    DUPLICATE_COMMITMENT: 'The rider is already committed for this occurrence.',
    SCHEDULE_CONFLICT: 'The request conflicts with the current schedule.',
    INVALID_SEAT_QUANTITY: 'The requested seat quantity is invalid.',
    NO_REMAINING_CAPACITY: 'The car no longer has enough seats.',
    OUTDATED_PROPOSAL: 'The proposal expired. Ask the rider to refresh it.',
    INVALID_PROPOSAL: 'The proposal is invalid or changed.', OFFER_CHANGED: 'The driver offer changed.',
  } as Partial<Record<RequestTransitionCode, string>>)[code] ?? 'The request could not be updated.';
}

export function useRides(): Rides {
  const rides = useContext(RidesContext);
  if (!rides) {
    throw new Error('useRides must be used within a RidesProvider');
  }
  return rides;
}
