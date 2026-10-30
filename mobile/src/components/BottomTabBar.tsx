import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const isAndroid = process.env.EXPO_OS === 'android';
const ICON_SIZE = 24;

function formatBadge(badge: string | number): string {
  return typeof badge === 'number' && badge > 99 ? '99+' : String(badge);
}

// Follows the platform tab bar conventions: iOS tints the icon and label of the
// selected tab; Android (Material 3) adds a pill indicator behind the selected icon.
export function BottomTabBar(props: BottomTabBarProps) {
  const { state, descriptors, insets } = props;
  const anyProps = props as any;
  const navigation = anyProps.navigation;
  const emitter = anyProps.emitter;
  const navigateToTab = anyProps.navigateToTab;

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        if ((options as any).href === null) {
          return null;
        }
        const focused = state.index === index;
        const color = focused ? colors.accent : colors.textMuted;
        const label = options.title ?? route.name;
        const badge = options.tabBarBadge;

        function selectTab() {
          const event = emitter
            ? emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            : navigation?.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

          // Re-tapping the active tab is handled by its stack, which pops to the root.
          if (!focused && !event?.defaultPrevented) {
            if (navigateToTab) {
              navigateToTab(route.key);
            } else {
              navigation?.navigate(route.name, route.params);
            }
          }
        }

        return (
          <Pressable
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            android_ripple={{ borderless: true, color: colors.accentSoft, radius: 36 }}
            key={route.key}
            onLongPress={() => {
              if (emitter) {
                emitter.emit({ type: 'tabLongPress', target: route.key });
              } else {
                navigation?.emit({ type: 'tabLongPress', target: route.key });
              }
            }}
            onPress={selectTab}
            style={styles.tab}
          >
            <View style={[styles.iconWrap, isAndroid && focused && styles.indicator]}>
              {options.tabBarIcon?.({ focused, color, size: ICON_SIZE })}
              {badge !== undefined && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{formatBadge(badge)}</Text>
                </View>
              )}
            </View>
            <Text numberOfLines={1} style={[styles.label, { color }, focused && styles.labelFocused]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingTop: isAndroid ? spacing.md : spacing.sm,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: isAndroid ? spacing.xs : 2,
    justifyContent: 'flex-start',
    minHeight: 44,
  },
  iconWrap: {
    alignItems: 'center',
    height: isAndroid ? 32 : 28,
    justifyContent: 'center',
    width: 64,
  },
  indicator: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    left: 38,
    minWidth: 20,
    paddingHorizontal: 4,
    position: 'absolute',
    top: -4,
  },
  badgeText: {
    color: colors.surface,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  label: {
    fontSize: isAndroid ? 12 : 10,
    fontWeight: '600',
  },
  labelFocused: {
    fontWeight: '700',
  },
});
