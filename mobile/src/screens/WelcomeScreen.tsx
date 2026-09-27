import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AuthUser, signInWithGoogle } from '../auth/authService';
import { AuthProviderButton } from '../components/AuthProviderButton';
import { GoogleLogo } from '../components/GoogleLogo';
import { colors, spacing } from '../theme';

interface WelcomeScreenProps {
  onContinueWithEmail: () => void;
  onAuthenticated: (user: AuthUser) => void;
}

const REVEAL_DISTANCE_RATIO = 0.18;
const REVEAL_VELOCITY = -0.7;

export function WelcomeScreen({ onContinueWithEmail, onAuthenticated }: WelcomeScreenProps) {
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [translateY] = useState(() => new Animated.Value(0));
  const [promptOffset] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const promptAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(promptOffset, {
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          toValue: -8,
          useNativeDriver: true,
        }),
        Animated.timing(promptOffset, {
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    promptAnimation.start();
    return () => promptAnimation.stop();
  }, [promptOffset]);

  function revealSignIn() {
    if (viewportHeight <= 0 || revealing || revealed) {
      return;
    }

    setRevealing(true);
    Animated.timing(translateY, {
      duration: 380,
      easing: Easing.out(Easing.cubic),
      toValue: -viewportHeight,
      useNativeDriver: true,
    }).start(({ finished }) => {
      setRevealing(false);
      if (finished) {
        setRevealed(true);
      }
    });
  }

  function returnToIntro() {
    Animated.spring(translateY, {
      damping: 18,
      stiffness: 180,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      !revealing &&
      !revealed &&
      gesture.dy < -6 &&
      Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => {
      translateY.setValue(Math.max(-viewportHeight, Math.min(0, gesture.dy)));
    },
    onPanResponderRelease: (_, gesture) => {
      if (
        gesture.dy <= -viewportHeight * REVEAL_DISTANCE_RATIO ||
        gesture.vy <= REVEAL_VELOCITY
      ) {
        revealSignIn();
      } else {
        returnToIntro();
      }
    },
    onPanResponderTerminate: returnToIntro,
    onPanResponderTerminationRequest: () => true,
  });

  async function continueWithGoogle() {
    setError(null);
    setGooglePending(true);
    try {
      onAuthenticated(await signInWithGoogle());
    } catch {
      setGooglePending(false);
      setError('Google sign-in didn’t go through. Try again.');
    }
  }

  function measureViewport({ nativeEvent }: LayoutChangeEvent) {
    const { height } = nativeEvent.layout;
    if (height === viewportHeight) {
      return;
    }

    setViewportHeight(height);
    if (revealed) {
      translateY.setValue(-height);
    }
  }

  return (
    <View onLayout={measureViewport} style={styles.viewport}>
      {viewportHeight > 0 && (
        <Animated.View
          {...(!revealed ? panResponder.panHandlers : {})}
          style={[
            styles.panels,
            { height: viewportHeight * 2, transform: [{ translateY }] },
          ]}
        >
          <View
            accessibilityLabel="Seawolves welcome screen"
            importantForAccessibility={revealed ? 'no-hide-descendants' : 'auto'}
            style={[styles.panel, styles.introPanel, { height: viewportHeight }]}
          >
            <Image
              accessibilityLabel="Stony Brook Seawolves logo"
              resizeMode="contain"
              source={require('../../assets/seawolf-logo-transparent.png')}
              style={styles.logo}
            />

            <Animated.View style={{ transform: [{ translateY: promptOffset }] }}>
              <Pressable
                accessibilityHint="Reveals sign-in options"
                accessibilityLabel="Slide up to continue"
                accessibilityRole="button"
                hitSlop={16}
                onPress={revealSignIn}
                style={({ pressed }) => [styles.prompt, pressed && styles.promptPressed]}
              >
                <Ionicons color="#ffffff" name="chevron-up" size={28} />
                <Text style={styles.promptText}>Slide up</Text>
              </Pressable>
            </Animated.View>
          </View>

          <ScrollView
            contentContainerStyle={styles.signInContent}
            importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
            showsVerticalScrollIndicator={false}
            style={[styles.panel, { height: viewportHeight }]}
          >
            <View style={styles.brand}>
              <Text accessibilityRole="header" style={styles.title}>
                Seawolf Rides
              </Text>
              <Text style={styles.tagline}>Ride with the pack.</Text>
            </View>

            <View style={styles.actions}>
              <AuthProviderButton
                disabled={googlePending}
                icon={<GoogleLogo />}
                label="Continue with Google"
                loading={googlePending}
                onPress={continueWithGoogle}
              />
              <AuthProviderButton
                disabled={googlePending}
                icon={<Ionicons color={colors.text} name="mail-outline" size={20} />}
                label="Continue with email"
                onPress={onContinueWithEmail}
              />
              {error && (
                <Text accessibilityLiveRegion="polite" style={styles.error}>
                  {error}
                </Text>
              )}
            </View>
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    backgroundColor: colors.accentDark,
    flex: 1,
    overflow: 'hidden',
  },
  panels: {
    width: '100%',
  },
  panel: {
    width: '100%',
  },
  introPanel: {
    alignItems: 'center',
    backgroundColor: colors.accentDark,
    justifyContent: 'space-between',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  logo: {
    flex: 1,
    maxHeight: 430,
    maxWidth: 430,
    width: '100%',
  },
  prompt: {
    alignItems: 'center',
    minHeight: 64,
    minWidth: 120,
  },
  promptPressed: {
    opacity: 0.7,
  },
  promptText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: spacing.xs,
  },
  signInContent: {
    backgroundColor: colors.background,
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  brand: {
    marginBottom: spacing.xxl * 2,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 44,
    textAlign: 'center',
  },
  tagline: {
    color: colors.accent,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 27,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.md,
    width: '100%',
  },
  error: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
});
