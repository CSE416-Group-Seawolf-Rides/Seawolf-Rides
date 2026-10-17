import { Redirect } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Text, View } from 'react-native';
export function DevelopmentOnly({ children }: PropsWithChildren) {
  if (!__DEV__) return <Redirect href="/home" />;
  return (
    <View style={{ flex: 1 }}>
      <Text accessibilityRole="header">
        Development simulation — synthetic participants; local state only
      </Text>
      {children}
    </View>
  );
}
