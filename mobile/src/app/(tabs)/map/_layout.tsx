import { Stack } from 'expo-router';

import { stackScreenOptions } from '../../../navigation/stackScreenOptions';

export const unstable_settings = {
  anchor: 'index',
};

export default function MapLayout() {
  return <Stack screenOptions={stackScreenOptions} />;
}
