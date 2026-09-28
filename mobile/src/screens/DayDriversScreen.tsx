import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { Weekday } from '../commute/commuteModel';
import { OfferCard } from '../rides/components/OfferCard';
import { RequestSheet } from '../rides/components/RequestSheet';
import { DriverMatch, RequestStatus } from '../rides/rideModel';
import { colors } from '../theme';

interface DayDriversScreenProps {
  day: Weekday;
  dayName: string;
  matches: DriverMatch[];
  statusFor: (offerId: string) => RequestStatus | undefined;
  requestableDaysFor: (offerId: string) => Weekday[];
  onBack: () => void;
  onOpenOffer: (offerId: string) => void;
  onSendRequest: (offerId: string, days: Weekday[]) => void;
}

// The full, ranked list behind a day's carousel on Home.
export function DayDriversScreen({
  day,
  dayName,
  matches,
  statusFor,
  requestableDaysFor,
  onBack,
  onOpenOffer,
  onSendRequest,
}: DayDriversScreenProps) {
  const [requesting, setRequesting] = useState<DriverMatch | null>(null);

  return (
    <Screen
      eyebrow="FIND A DRIVER"
      onBack={onBack}
      subtitle="Ranked by how well they fit your arrival time."
      title={`Drivers for ${dayName}`}
    >
      {matches.length === 0 ? (
        <Card>
          <Text style={styles.empty}>No drivers go on {dayName} yet.</Text>
        </Card>
      ) : (
        matches.map((match) => (
          <OfferCard
            canRequest={requestableDaysFor(match.offer.id).length > 0}
            key={match.offer.id}
            match={match}
            onOpen={() => onOpenOffer(match.offer.id)}
            onRequest={() => setRequesting(match)}
            requestStatus={statusFor(match.offer.id)}
          />
        ))
      )}

      {requesting && (
        <RequestSheet
          initialDays={[day]}
          offer={requesting.offer}
          onClose={() => setRequesting(null)}
          onSend={(days) => {
            onSendRequest(requesting.offer.id, days);
            setRequesting(null);
          }}
          sharedDays={requestableDaysFor(requesting.offer.id)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});
