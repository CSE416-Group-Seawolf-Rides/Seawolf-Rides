import { useState } from 'react';
import { Image, type ImageSourcePropType, StyleSheet, Text, View } from 'react-native';

import type { SampleAvatar } from '../profiles/publicProfiles';
import { chooseAvatarPresentation } from '../profiles/avatarModel';
import { radii } from '../theme';

interface AvatarProps {
  name: string;
  size?: number;
  participantId?: string;
  imageSource?: ImageSourcePropType | null;
  sampleAvatar?: SampleAvatar;
}

export function Avatar({ name, size = 44, participantId, imageSource, sampleAvatar }: AvatarProps) {
  const sourceKey = imageSource ? JSON.stringify(imageSource) : null;
  const [failedSourceKey, setFailedSourceKey] = useState<string | null>(null);
  const imageFailed = sourceKey !== null && failedSourceKey === sourceKey;
  const presentation = chooseAvatarPresentation({
    hasImage: Boolean(imageSource), imageFailed, sampleAvatar,
  });
  const palette = sampleAvatar ? samplePalettes[sampleAvatar] : defaultPalettes[stableIndex(participantId ?? name, defaultPalettes.length)];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.avatar, { backgroundColor: palette.background, height: size, width: size }]}
    >
      {presentation === 'IMAGE' && imageSource ? (
        <Image onError={() => setFailedSourceKey(sourceKey)} source={imageSource} style={{ height: size, width: size }} />
      ) : presentation === 'SAMPLE' ? (
        <View style={styles.sample}>
          <View style={[styles.sampleHead, { backgroundColor: palette.foreground, height: size * 0.31, width: size * 0.31 }]} />
          <View style={[styles.sampleShoulders, { backgroundColor: palette.foreground, height: size * 0.36, width: size * 0.68 }]} />
        </View>
      ) : (
        <Text style={[styles.initial, { color: palette.foreground, fontSize: size * 0.42 }]}>{name.charAt(0).toUpperCase() || '?'}</Text>
      )}
    </View>
  );
}

const samplePalettes: Record<SampleAvatar, { background: string; foreground: string }> = {
  coral: { background: '#fbe3dd', foreground: '#a83c2b' },
  ocean: { background: '#dcecf8', foreground: '#24628d' },
  forest: { background: '#dceee2', foreground: '#28704a' },
  violet: { background: '#ebe1f5', foreground: '#6d4093' },
  gold: { background: '#f8edce', foreground: '#8a6514' },
  sky: { background: '#dff1f2', foreground: '#287379' },
};
const defaultPalettes = Object.values(samplePalettes);

function stableIndex(value: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash * 31) + value.charCodeAt(index)) >>> 0;
  return hash % length;
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: radii.pill,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    fontWeight: '800',
  },
  sample: { alignItems: 'center', height: '100%', justifyContent: 'flex-end', width: '100%' },
  sampleHead: { borderRadius: radii.pill, marginBottom: '4%' },
  sampleShoulders: { borderTopLeftRadius: radii.pill, borderTopRightRadius: radii.pill },
});
