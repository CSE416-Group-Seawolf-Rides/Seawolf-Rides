import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

export function MapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>MAP WILL BE HERE SOON</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  message: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
