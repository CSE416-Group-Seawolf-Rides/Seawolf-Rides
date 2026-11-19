import { createElement } from 'react';

import { colors, radii } from '../../theme';

interface WebTimeInputProps {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
}

function toInputValue(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
}

// Browser time picker for the web build. @react-native-community/datetimepicker has no web
// implementation, so web renders the browser's own <input type="time"> instead.
export function WebTimeInput({ label, minutes, onChange }: WebTimeInputProps) {
  return createElement('input', {
    'aria-label': label,
    onChange: (event: { target: { value: string } }) => {
      const [hours, mins] = event.target.value.split(':').map(Number);
      if (Number.isInteger(hours) && Number.isInteger(mins)) onChange(hours * 60 + mins);
    },
    step: 300,
    style: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.md,
      color: colors.text,
      fontSize: 16,
      minHeight: 44,
      padding: '0 12px',
    },
    type: 'time',
    value: toInputValue(minutes),
  });
}
