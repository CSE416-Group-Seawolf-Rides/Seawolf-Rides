import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthUser, signInWithGoogle } from '../auth/authService';
import { AuthProviderButton } from '../components/AuthProviderButton';
import { GoogleLogo } from '../components/GoogleLogo';
import { colors, spacing } from '../theme';

interface WelcomeScreenProps {
  onContinueWithEmail: () => void;
  onAuthenticated: (user: AuthUser) => void;
}

const INTRO_NAVY = '#06162d';
const REVEAL_DISTANCE_RATIO = 0.18;
const REVEAL_VELOCITY = -0.7;

export function WelcomeScreen({ onContinueWithEmail, onAuthenticated }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets();
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [swipeY] = useState(() => new Animated.Value(0));
  const [logoOpacity] = useState(() => new Animated.Value(0));
  const [logoEntranceScale] = useState(() => new Animated.Value(0.92));
  const [promptOffset] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const logoEntrance = Animated.parallel([
      Animated.timing(logoOpacity, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(logoEntranceScale, {
        duration: 320,
        easing: Easing.out(Easing.back(1.15)),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]);
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

    logoEntrance.start();
    promptAnimation.start();

    return () => {
      logoEntrance.stop();
      promptAnimation.stop();
    };
  }, [logoEntranceScale, logoOpacity, promptOffset]);

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

  function revealSignIn() {
    if (viewportHeight <= 0 || revealing || revealed) {
      return;
    }

    setRevealing(true);
    Animated.timing(swipeY, {
      duration: 420,
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
    Animated.spring(swipeY, {
      damping: 20,
      stiffness: 190,
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
      swipeY.setValue(Math.max(-viewportHeight, Math.min(0, gesture.dy)));
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

  function measureViewport({ nativeEvent }: LayoutChangeEvent) {
    const { height } = nativeEvent.layout;
    if (height !== viewportHeight) {
      setViewportHeight(height);
    }
  }

  const swipeProgress =
    viewportHeight > 0
      ? swipeY.interpolate({
          inputRange: [-viewportHeight, 0],
          outputRange: [1, 0],
          extrapolate: 'clamp',
        })
      : 0;
  const landingTranslateY =
    viewportHeight > 0
      ? swipeY.interpolate({
          inputRange: [-viewportHeight, 0],
          outputRange: [0, viewportHeight],
          extrapolate: 'clamp',
        })
      : 0;
  const logoSwipeScale =
    viewportHeight > 0
      ? swipeY.interpolate({
          inputRange: [-viewportHeight, -viewportHeight * 0.45, 0],
          outputRange: [0.48, 0.72, 1],
          extrapolate: 'clamp',
        })
      : 1;
  const introOpacity =
    viewportHeight > 0
      ? swipeY.interpolate({
          inputRange: [-viewportHeight, -viewportHeight * 0.45, 0],
          outputRange: [0, 0.9, 1],
          extrapolate: 'clamp',
        })
      : 1;

  return (
    <View onLayout={measureViewport} style={styles.viewport}>
      <StatusBar animated style={revealed ? 'dark' : 'light'} />

      <Animated.ScrollView
        contentContainerStyle={[
          styles.signInContent,
          {
            paddingBottom: spacing.xl + insets.bottom,
            paddingTop: spacing.xl + insets.top,
          },
        ]}
        importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
        showsVerticalScrollIndicator={false}
        style={[
          styles.landingPage,
          {
            opacity: revealed ? 1 : swipeProgress,
            transform: [{ translateY: revealed ? 0 : landingTranslateY }],
          },
        ]}
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
      </Animated.ScrollView>

      {!revealed && (
        <Animated.View
          {...panResponder.panHandlers}
          accessibilityLabel="Seawolf Rides introduction. Swipe up to continue."
          style={[
            styles.introOverlay,
            { opacity: introOpacity, transform: [{ translateY: swipeY }] },
          ]}
        >
          <Animated.View
            style={[
              styles.logoFrame,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoEntranceScale }, { scale: logoSwipeScale }],
              },
            ]}
          >
            <Image
              accessibilityLabel="Stony Brook Seawolves logo"
              resizeMode="contain"
              source={require('../../assets/seawolf-logo-transparent.png')}
              style={styles.logo}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.promptPosition,
              {
                bottom: spacing.xl + insets.bottom,
                transform: [{ translateY: promptOffset }],
              },
            ]}
          >
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
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    backgroundColor: colors.background,
    flex: 1,
    overflow: 'hidden',
  },
  landingPage: {
    flex: 1,
  },
  signInContent: {
    backgroundColor: colors.background,
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
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
  introOverlay: {
    alignItems: 'center',
    backgroundColor: INTRO_NAVY,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: spacing.xl,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  logoFrame: {
    alignItems: 'center',
  },
  logo: {
    height: 360,
    width: 360,
  },
  promptPosition: {
    alignSelf: 'center',
    position: 'absolute',
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
});
