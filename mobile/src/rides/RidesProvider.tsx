import * as Haptics from 'expo-haptics';
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
import { demoIncoming, demoOutgoing } from '../prototypeData/demoAccount';
import { validateDatedRideProposal, type DatedRideProposalV1 } from './datedRideProposal';
import { driverOfferFixtures, riderRequestFixtures } from './rideFixtures';
import {
  IncomingRequest,
  OutgoingRequest,
  reconcileRideState,
  reconcileSkippedDays,
  sharedDrivingDays,
} from './rideModel';
import {
  createDatedOutgoingRequest,
  transitionDatedOutgoingRequest,
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
  respondToRequest: (requestId: string, status: 'accepted' | 'declined') => RequestTransitionCode;
  // Trip ids (local dates) the user can't make. The recurring match stays in place.
  skipped: string[];
  skipTrip: (tripId: string) => void;
  undoSkip: (tripId: string) => void;
}

const RidesContext = createContext<Rides | null>(null);

// Demo only: drivers "respond" a few seconds after a request so the whole
// request → confirmed loop can be tried on one phone.
const DEMO_DRIVER_RESPONSE_MS = 5000;

// Frontend-only M2 state. Lives inside the signed-in tabs, so sign-out clears it.
export function RidesProvider({ children }: PropsWithChildren) {
  const { user, commute } = useSession();
  // Returning (demo) users start mid-week; brand-new accounts start from scratch.
  const returning = user !== null && !user.isNewUser;
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>(() =>
    returning ? demoOutgoing : [],
  );
  const [incoming, setIncoming] = useState<IncomingRequest[]>(() =>
    returning
      ? demoIncoming(riderRequestFixtures)
      : riderRequestFixtures.map((request) => ({ ...request, status: 'pending' })),
  );
  const [skipped, setSkipped] = useState<string[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const commuteRef = useRef(commute);
  const outgoingRef = useRef(outgoing);
  const incomingRef = useRef(incoming);
  const skippedRef = useRef(skipped);

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
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!commute) {
      return;
    }
    setOutgoing((current) => {
      const next = reconcileRideState(commute, current, []).outgoing;
      const keptIds = new Set(next.map((request) => request.id));
      current
        .filter((request) => !keptIds.has(request.id))
        .forEach((request) => {
          clearTimeout(timers.current.get(request.id));
          timers.current.delete(request.id);
        });
      return next;
    });
    setIncoming((current) => reconcileRideState(commute, [], current).incoming);
    setSkipped((current) => reconcileSkippedDays(commute, current));
  }, [commute]);

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
        timers.current.set(
          id,
          setTimeout(() => {
            timers.current.delete(id);
            const currentCommute = commuteRef.current;
            const currentDays =
              outgoingRef.current.find((request) => request.id === id)?.days ?? [];
            const hasDrivingConflict =
              currentCommute !== null &&
              currentDays.some((day) =>
                incomingRef.current.some(
                  (request) =>
                    request.status === 'accepted' &&
                    request.days.includes(day) &&
                    sharedDrivingDays(currentCommute, request).includes(day),
                ),
              );
            setOutgoing((current) =>
              current.map((request) =>
                request.id === id && request.status === 'pending'
                  ? { ...request, status: hasDrivingConflict ? 'declined' : 'accepted' }
                  : request,
              ),
            );
            Haptics.notificationAsync(
              hasDrivingConflict
                ? Haptics.NotificationFeedbackType.Warning
                : Haptics.NotificationFeedbackType.Success,
            );
          }, DEMO_DRIVER_RESPONSE_MS),
        );
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
        timers.current.set(id, setTimeout(() => {
          timers.current.delete(id);
          const transition = transitionDatedOutgoingRequest({
            requests: outgoingRef.current,
            requestId: id,
            status: 'accepted',
            offers: driverOfferFixtures,
            nowEpochSeconds: Math.floor(Date.now() / 1000),
            riderCommute: commuteRef.current,
            incoming: incomingRef.current,
            skippedDates: skippedRef.current,
          });
          if (transition.ok) {
            outgoingRef.current = transition.requests;
            setOutgoing(transition.requests);
          }
          Haptics.notificationAsync(transition.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
        }, DEMO_DRIVER_RESPONSE_MS));
        return 'CREATED';
      },
      // Withdraws every request with this driver (a pending ask or the whole carpool).
      cancelRequest: (offerId) => {
        setOutgoing((current) => {
          current
            .filter((request) => request.offerId === offerId)
            .forEach((request) => {
              clearTimeout(timers.current.get(request.id));
              timers.current.delete(request.id);
            });
          return current.filter((request) => request.offerId !== offerId);
        });
      },
      // Withdraws one pending ask, leaving other days with the same driver untouched.
      withdrawRequest: (requestId) => {
        clearTimeout(timers.current.get(requestId));
        timers.current.delete(requestId);
        setOutgoing((current) => current.filter((request) => request.id !== requestId));
      },
      respondToRequest: (requestId, status) => {
        const transition = transitionIncomingRequest({
          commute: commuteRef.current,
          requests: incomingRef.current,
          outgoing: outgoingRef.current,
          requestId,
          status,
          nowEpochSeconds: Math.floor(Date.now() / 1000),
        });
        if (transition.ok) {
          incomingRef.current = transition.requests;
          setIncoming(transition.requests);
        }
        return transition.code;
      },
      skipped,
      skipTrip: (tripId) =>
        setSkipped((current) => (current.includes(tripId) ? current : [...current, tripId])),
      undoSkip: (tripId) => setSkipped((current) => current.filter((id) => id !== tripId)),
    }),
    [commute, outgoing, incoming, skipped],
  );

  return <RidesContext.Provider value={rides}>{children}</RidesContext.Provider>;
}

export function useRides(): Rides {
  const rides = useContext(RidesContext);
  if (!rides) {
    throw new Error('useRides must be used within a RidesProvider');
  }
  return rides;
}
