import type { PrivacyArea } from '../commute/commuteModel';

export interface RiderMapCandidate {
  id: string;
  name: string;
  approximateArea: PrivacyArea;
}
