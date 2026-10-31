import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme';

export function openPublicProfile(participantId: string, name: string) {
  router.push({ pathname: '/profile/[participantId]', params: { participantId, name } });
}

/** Sheet callers defer navigation until their native modal has finished dismissing. */
export function PublicProfileLink({ participantId, name, children, disabled, onOpen, style }: {
  participantId: string; name: string; children?: ReactNode; disabled?: boolean;
  onOpen?: () => void; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${name}'s public profile`}
    disabled={disabled || !participantId}
    style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center' }, style, pressed && { opacity: 0.7 }]}
    onPress={(event) => {
      event.stopPropagation();
      if (onOpen) onOpen();
      else openPublicProfile(participantId, name);
    }}>
    {children ?? <Text style={{ color: colors.accent, fontWeight: '700' }}>{name ? `View ${name}’s public profile` : 'View public profile'}</Text>}
  </Pressable>;
}
