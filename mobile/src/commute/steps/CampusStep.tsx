import { Text } from 'react-native';
import { ChoiceCard } from '../../components/flow/ChoiceCard';
import { FlowProgress, FlowStep } from '../../components/flow/FlowStep';
import type { CommuteRole } from '../../onboarding/onboardingModel';
import { CampusLotId, campusLots, lotTitle } from '../commuteModel';
import { useCommuteDraft } from '../CommuteDraftProvider';

interface CampusStepProps {
  role: CommuteRole;
  progress?: FlowProgress;
  continueLabel?: string;
  onContinue: () => void;
}

const titles: Record<CommuteRole, string> = {
  driver: 'Where do you usually park?',
  rider: 'Where should drivers drop you off?',
  both: 'Where do you usually arrive on campus?',
};

function reactionFor(role: CommuteRole, lot: CampusLotId): string {
  if (role === 'rider' && lot === 'other') return 'We’ll show drivers going to any supported campus stop.';
  if (lot === 'other') {
    return 'No problem. You and your match can agree on the exact spot.';
  }
  const name = lotTitle(lot);
  return role === 'rider'
    ? `We’ll prioritize ${name}, while still showing other campus drop-offs.`
    : `Got it. Riders headed to ${name} will see your trips first.`;
}

export function CampusStep({ role, progress, onContinue, continueLabel }: CampusStepProps) {
  const { draft, updateDraft } = useCommuteDraft();

  return (
    <FlowStep
      continueLabel={continueLabel}
      canContinue={draft.campusLot !== undefined && (role === 'rider' || draft.campusLot !== 'other')}
      onContinue={onContinue}
      progress={progress}
      reaction={draft.riderDropoffPreference === 'any' && role === 'rider' ? 'We’ll show any supported campus drop-off.' : draft.campusLot ? reactionFor(role, draft.campusLot) : null}
      subtitle="Pick where you usually end up. You can change it for any ride."
      title={titles[role]}
    >
      {campusLots.filter((lot) => role === 'rider' || lot.value !== 'other').map((lot) => (
        <ChoiceCard
          description={role === 'rider' && lot.value === 'other' ? undefined : lot.description}
          key={lot.value}
          onPress={() => updateDraft({ campusLot: lot.value, ...(role === 'rider' ? { riderDropoffPreference: lot.value === 'other' ? 'any' : undefined } : {}) })}
          selected={draft.campusLot === lot.value}
          title={role === 'rider' && lot.value === 'other' ? 'Any' : lot.title}
        />
      ))}
      {role === 'both' && <>
        <Text>When riding, preferred drop-off</Text>
        <ChoiceCard title="Any" selected={draft.riderDropoffPreference === 'any'}
          description="Keep your parking choice for driving days."
          onPress={() => updateDraft({ riderDropoffPreference: draft.riderDropoffPreference === 'any' ? undefined : 'any' })} />
      </>}
    </FlowStep>
  );
}
