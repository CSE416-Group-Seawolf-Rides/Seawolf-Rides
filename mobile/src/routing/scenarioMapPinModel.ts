export const SCENARIO_MAP_PIN_DIMENSIONS = { width: 40, height: 52 } as const;

export const SCENARIO_MAP_PIN_COLORS = {
  DRIVER: '#8f1d2c',
  RIDER: '#1565a8',
  CAMPUS: '#26734d',
} as const;

export type ScenarioMapPinRole = keyof typeof SCENARIO_MAP_PIN_COLORS;

export function scenarioMapPinAccessibilityLabel(name: string, role: ScenarioMapPinRole, approximate = false): string {
  if (role === 'CAMPUS') return `${name}, campus destination`;
  return `${name}, ${role.toLowerCase()}${role === 'RIDER' ? approximate ? ', approximate area' : ', confirmed pickup' : ''}`;
}
