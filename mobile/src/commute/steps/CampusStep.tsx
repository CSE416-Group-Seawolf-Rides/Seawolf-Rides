import { ChoiceCard } from '../../components/flow/ChoiceCard';
import { FlowProgress, FlowStep } from '../../components/flow/FlowStep';
import type { CommuteRole } from '../../onboarding/onboardingModel';
import { CampusLotId, campusLots, lotTitle } from '../commuteModel';
import { useCommuteDraft } from '../CommuteDraftProvider';

interface CampusStepProps {
  role: CommuteRole;
  progress: FlowProgress;
  onContinue: () => void;
}

const titles: Record<CommuteRole, string> = {
  driver: 'Where do you usually park?',
  rider: 'Where should drivers drop you off?',
  both: 'Where do you usually arrive on campus?',
};

function reactionFor(role: CommuteRole, lot: CampusLotId): string {
  if (lot === 'other') {
    return 'No problem. You and your match can agree on the exact spot.';
  }
  const name = lotTitle(lot);
  return role === 'rider'
    ? `Got it. We’ll look for drivers heading to ${name}.`
    : `Got it. Riders headed to ${name} will see your trips first.`;
}

export function CampusStep({ role, progress, onContinue }: CampusStepProps) {
  const { draft, updateDraft } = useCommuteDraft();

  return (
    <FlowStep
      canContinue={draft.campusLot !== undefined}
      onContinue={onContinue}
      progress={progress}
      reaction={draft.campusLot ? reactionFor(role, draft.campusLot) : null}
      subtitle="Pick where you usually end up. You can change it for any ride."
      title={titles[role]}
    >
      {campusLots.map((lot) => (
        <ChoiceCard
          description={lot.description}
          key={lot.value}
          onPress={() => updateDraft({ campusLot: lot.value })}
          selected={draft.campusLot === lot.value}
          title={lot.title}
        />
      ))}
    </FlowStep>
  );
}
