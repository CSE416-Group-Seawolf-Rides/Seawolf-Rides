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
import { riderRequestFixtures } from './rideFixtures';
import { IncomingRequest, OutgoingRequest } from './rideModel';

interface Rides {
  outgoing: OutgoingRequest[];
  incoming: IncomingRequest[];
  sendRequest: (offerId: string, days: Weekday[]) => void;
  cancelRequest: (offerId: string) => void;
  withdrawRequest: (requestId: string) => void;
  respondToRequest: (requestId: string, status: 'accepted' | 'declined') => void;
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
  const { user } = useSession();
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

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const rides = useMemo<Rides>(
    () => ({
      outgoing,
      incoming,
      // Adds a request alongside any earlier ones with the same driver, so asking for
      // Friday never touches an already-confirmed Monday.
      sendRequest: (offerId, days) => {
        const id = `request-${offerId}-${Date.now()}`;
        setOutgoing((current) => [...current, { id, offerId, days, status: 'pending' }]);
        timers.current.set(
          id,
          setTimeout(() => {
            timers.current.delete(id);
            setOutgoing((current) =>
              current.map((request) =>
                request.id === id && request.status === 'pending'
                  ? { ...request, status: 'accepted' }
                  : request,
              ),
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }, DEMO_DRIVER_RESPONSE_MS),
        );
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
      respondToRequest: (requestId, status) =>
        setIncoming((current) =>
          current.map((request) => (request.id === requestId ? { ...request, status } : request)),
        ),
      skipped,
      skipTrip: (tripId) =>
        setSkipped((current) => (current.includes(tripId) ? current : [...current, tripId])),
      undoSkip: (tripId) => setSkipped((current) => current.filter((id) => id !== tripId)),
    }),
    [outgoing, incoming, skipped],
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
