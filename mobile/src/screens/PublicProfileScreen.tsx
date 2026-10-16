import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import type { PublicProfile } from '../profiles/publicProfiles';
import { colors, radii, spacing } from '../theme';

interface PublicProfileScreenProps {
  profile: PublicProfile;
  profileKnown: boolean;
  onClose: () => void;
}

export function PublicProfileScreen({ profile, profileKnown, onClose }: PublicProfileScreenProps) {
  const [pictureOpen, setPictureOpen] = useState(false);
  const role = profile.role === 'both' ? 'Rider and driver' : profile.role === 'driver' ? 'Driver' : profile.role === 'rider' ? 'Rider' : null;
  const avatar = (size: number) => <Avatar imageSource={profile.photoUri ? { uri: profile.photoUri } : null} name={profile.displayName} participantId={profile.participantId} sampleAvatar={profile.sampleAvatar} size={size} />;

  return (
    <>
      <Screen eyebrow="PUBLIC PROFILE" onBack={onClose} title={profile.displayName}>
        <Card style={styles.profileCard}>
          <Pressable accessibilityHint="Opens a larger profile picture" accessibilityLabel={`View ${profile.displayName}'s profile picture`} accessibilityRole="button" onPress={() => setPictureOpen(true)} style={({ pressed }) => pressed && styles.pressed}>
            {avatar(112)}
          </Pressable>
          {role && <Text style={styles.role}>{role}</Text>}
          {profile.synthetic && <Text style={styles.synthetic}>Demo profile — synthetic user</Text>}
          {!profileKnown && <Text style={styles.fallback}>This person’s public profile details are not available yet.</Text>}
        </Card>

        {profile.publicInfo.length > 0 && <Card style={styles.publicInfo}>
          <Text accessibilityRole="header" style={styles.heading}>Public information</Text>
          {profile.publicInfo.map((item) => <Text key={item} style={styles.info}>{item}</Text>)}
        </Card>}

        <Text style={styles.privacy}>Profiles show only information explicitly marked public. Private locations, schedules, contact details, and pickup coordinates are not shown here.</Text>
      </Screen>

      <Modal animationType="fade" onRequestClose={() => setPictureOpen(false)} transparent visible={pictureOpen}>
        <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.pictureOverlay}>
          <Pressable accessibilityLabel="Close profile picture" accessibilityRole="button" onPress={() => setPictureOpen(false)} style={styles.closeButton}>
            <Ionicons color={colors.surface} name="close" size={28} />
          </Pressable>
          <View accessibilityLabel={`${profile.displayName}'s profile picture, enlarged`} style={styles.largePicture}>{avatar(240)}</View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  profileCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  pressed: { opacity: 0.68 },
  role: { color: colors.text, fontSize: 17, fontWeight: '800' },
  synthetic: { backgroundColor: colors.warningSoft, borderRadius: radii.pill, color: colors.warning, fontSize: 12, fontWeight: '800', overflow: 'hidden', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  fallback: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  publicInfo: { gap: spacing.sm },
  heading: { color: colors.text, fontSize: 17, fontWeight: '800' },
  info: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  privacy: { color: colors.textMuted, fontSize: 12, lineHeight: 18, paddingHorizontal: spacing.sm, textAlign: 'center' },
  pictureOverlay: { alignItems: 'center', backgroundColor: 'rgba(10,14,18,0.94)', flex: 1, justifyContent: 'center' },
  closeButton: { alignItems: 'center', height: 48, justifyContent: 'center', position: 'absolute', right: spacing.lg, top: spacing.lg, width: 48, zIndex: 1 },
  largePicture: { borderColor: colors.surface, borderRadius: radii.pill, borderWidth: 4, overflow: 'hidden' },
});
