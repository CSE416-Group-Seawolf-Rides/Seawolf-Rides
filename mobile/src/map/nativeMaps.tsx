// .tsx (not .ts) so Metro prefers nativeMaps.web.tsx on web: it tries each extension in turn,
// platform variants first, so a .ts base file would win over a .web.tsx sibling.
// Single entry point for maps. Native builds use react-native-maps; the browser build
// resolves nativeMaps.web.tsx instead, because react-native-maps has no web implementation.
export { default, Circle, Marker, Polyline } from 'react-native-maps';
export type { Camera, MapPressEvent } from 'react-native-maps';
