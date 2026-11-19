import { useWindowDimensions } from 'react-native';

// Web-only layout rules (docs/web-app-plan.md, section 11). Native builds never use the
// desktop layout: isWeb is false there, so every check below falls through to the phone UI.
export const isWeb = process.env.EXPO_OS === 'web';

// Below this width the website keeps the phone layout (bottom tabs, full-width buttons).
export const DESKTOP_MIN_WIDTH = 1024;
// Content column on desktop, centered with side gutters (uber.com uses ~1,150 px).
export const PAGE_MAX_WIDTH = 1200;
export const PAGE_GUTTER = 48;

// Smaller, flatter corners on the web, like uber.com (≈6–8 px controls).
export const webRadii = {
  control: 8,
  panel: 12,
} as const;

export function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return isWeb && width >= DESKTOP_MIN_WIDTH;
}

// Horizontal padding that centers a PAGE_MAX_WIDTH column in the window.
export function centeredGutter(windowWidth: number): number {
  return Math.max(PAGE_GUTTER, (windowWidth - PAGE_MAX_WIDTH) / 2);
}
