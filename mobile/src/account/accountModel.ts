export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export const PROBLEM_CATEGORIES = [
  { value: 'matching', label: 'Finding a match' },
  { value: 'ride_request', label: 'Requests or cancellations' },
  { value: 'chat', label: 'Messages' },
  { value: 'gas_share', label: 'Gas shares or payments' },
  { value: 'account_privacy', label: 'Account or privacy' },
  { value: 'other', label: 'Something else' },
] as const;
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number]['value'];
export interface ProblemReport {
  category: ProblemCategory;
  description: string;
  appVersion: string;
  platform: string;
}

export function validateEmergencyContact(input: EmergencyContact): EmergencyContact {
  const name = input.name.trim();
  const relationship = input.relationship.trim();
  const rawPhone = input.phone.trim();
  const digits = rawPhone.replace(/\D/g, '');
  if (!name || name.length > 80) throw new Error('Enter a name of up to 80 characters.');
  if (!/^\+?[0-9 ().-]+$/.test(rawPhone) || digits.length < 10 || digits.length > 15) {
    throw new Error('Enter a valid phone number, including the country code for numbers outside the US.');
  }
  if (relationship.length > 40) throw new Error('Keep the relationship to 40 characters or fewer.');
  const phone = !rawPhone.startsWith('+') && digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return { name, phone, relationship };
}

export function validateProblemReport(input: ProblemReport): ProblemReport {
  if (!PROBLEM_CATEGORIES.some((category) => category.value === input.category)) {
    throw new Error('Choose the topic that best describes the problem.');
  }
  const description = input.description.trim();
  if (description.length < 10 || description.length > 2000) {
    throw new Error('Describe the problem in 10 to 2,000 characters.');
  }
  if (!input.appVersion || input.appVersion.length > 40 || !['ios', 'android', 'web'].includes(input.platform)) {
    throw new Error('Couldn’t read the app details. Reopen the app and try again.');
  }
  return { ...input, description };
}

export function reportReference(id: string): string {
  return `SR-${id}`;
}
