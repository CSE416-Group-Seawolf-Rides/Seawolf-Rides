import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { centeredGutter } from '../web/webLayout';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// Desktop web navigation: a top bar with text links, like uber.com, instead of the phone's
// bottom tab bar. Tab presses go through the same events as BottomTabBar so nested stacks
// still pop to their root when the active tab is pressed again.
export function TopNavBar(props: TabBarProps) {
  const { state, descriptors } = props;
  const anyProps = props as any;
  const navigation = anyProps.navigation;
  const emitter = anyProps.emitter;
  const navigateToTab = anyProps.navigateToTab;
  const { width } = useWindowDimensions();
  const gutter = centeredGutter(width);

  return (
    <View style={styles.bar}>
      <View style={[styles.inner, { paddingHorizontal: gutter }]}>
        <View style={styles.brand}>
          <View style={styles.brandDot} />
          <Text style={styles.brandText}>Seawolf Rides</Text>
        </View>
        <View accessibilityRole="tablist" style={styles.links}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            if ((options as any).href === null) return null;
            const focused = state.index === index;
            const label = options.title ?? route.name;
            const badge = options.tabBarBadge;

            function selectTab() {
              const event = emitter
                ? emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                : navigation?.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event?.defaultPrevented) {
                if (navigateToTab) navigateToTab(route.key);
                else navigation?.navigate(route.name, route.params);
              }
            }

            return (
              <Pressable
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                key={route.key}
                onPress={selectTab}
                // React Native Web adds `hovered` to the Pressable state; native types omit it.
                style={(state) => [
                  styles.link,
                  (state as { hovered?: boolean }).hovered && !focused && styles.linkHovered,
                ]}
              >
                <Text style={[styles.linkText, focused && styles.linkTextActive]}>{label}</Text>
                {badge !== undefined && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                )}
                <View style={[styles.underline, focused && styles.underlineActive]} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  inner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxl,
    height: 64,
  },
  brand: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  brandDot: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 12,
    width: 12,
  },
  brandText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  links: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.xs, height: '100%' },
  link: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  linkHovered: { backgroundColor: colors.surfaceMuted },
  linkText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  linkTextActive: { color: colors.text, fontWeight: '700' },
  underline: {
    bottom: 0,
    height: 2,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  underlineActive: { backgroundColor: colors.accent },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
  },
  badgeText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
});
