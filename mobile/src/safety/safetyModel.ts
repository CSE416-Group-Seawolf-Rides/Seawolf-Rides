export interface BlockedUser {
  targetId: string;
  targetName: string;
  createdAt: number;
}

export type ReportReason =
  | 'harassment'
  | 'unsafe_driving'
  | 'no_show'
  | 'inappropriate_behavior'
  | 'scam_or_fraud'
  | 'other';

export interface ReportReasonOption {
  key: ReportReason;
  label: string;
  description: string;
}

export const REPORT_REASONS: readonly ReportReasonOption[] = [
  {
    key: 'inappropriate_behavior',
    label: 'Inappropriate behavior',
    description: 'Offensive language, disrespectful conduct, or personal boundary violations.',
  },
  {
    key: 'harassment',
    label: 'Harassment',
    description: 'Unwanted contact, intimidation, or persistent aggressive behavior.',
  },
  {
    key: 'unsafe_driving',
    label: 'Unsafe driving',
    description: 'Reckless speeding, phone use while moving, or vehicle safety hazards.',
  },
  {
    key: 'no_show',
    label: 'No-show / Abandoned ride',
    description: 'Failed to arrive without prior cancellation or reasonable communication.',
  },
  {
    key: 'scam_or_fraud',
    label: 'Scam or fraud',
    description: 'Payment demands outside agreement, impersonation, or suspicious requests.',
  },
  {
    key: 'other',
    label: 'Other problem',
    description: 'Any other safety concern or Stony Brook community guideline violation.',
  },
] as const;

export interface CreateReportInput {
  targetId: string;
  targetName: string;
  reason: ReportReason;
  details?: string;
}

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && REPORT_REASONS.some((r) => r.key === value);
}

export function parseBlockedUser(data: unknown, idFallback?: string): BlockedUser | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const targetId = typeof record.targetId === 'string' && record.targetId ? record.targetId : idFallback;
  const targetName = typeof record.targetName === 'string' && record.targetName.trim() ? record.targetName.trim() : 'Stony Brook Commuter';
  if (!targetId) return null;

  let createdAt = Date.now();
  if (record.createdAt && typeof record.createdAt === 'object' && 'toMillis' in record.createdAt) {
    createdAt = (record.createdAt as { toMillis: () => number }).toMillis();
  } else if (typeof record.createdAt === 'number') {
    createdAt = record.createdAt;
  }

  return {
    targetId,
    targetName,
    createdAt,
  };
}

export function validateReportInput(input: unknown): { valid: true; value: CreateReportInput } | { valid: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Invalid report request.' };
  }
  const r = input as Record<string, unknown>;
  if (typeof r.targetId !== 'string' || !r.targetId.trim()) {
    return { valid: false, error: 'A valid target user is required.' };
  }
  if (typeof r.targetName !== 'string' || !r.targetName.trim()) {
    return { valid: false, error: 'Target user name is required.' };
  }
  if (!isReportReason(r.reason)) {
    return { valid: false, error: 'Select a valid report category.' };
  }
  let details: string | undefined;
  if (r.details !== undefined && r.details !== null) {
    if (typeof r.details !== 'string') {
      return { valid: false, error: 'Details must be a text description.' };
    }
    const trimmed = r.details.trim();
    if (trimmed.length > 500) {
      return { valid: false, error: 'Details cannot exceed 500 characters.' };
    }
    details = trimmed || undefined;
  }

  return {
    valid: true,
    value: {
      targetId: r.targetId.trim(),
      targetName: r.targetName.trim().slice(0, 80),
      reason: r.reason,
      details,
    },
  };
}
