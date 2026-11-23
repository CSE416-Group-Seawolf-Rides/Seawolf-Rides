import assert from 'node:assert/strict';
import test from 'node:test';

import {
  anchorTransform,
  coordinateEvent,
  coordinatesCorners,
  dashArray,
  DEFAULT_PIN_COLOR,
  DEFAULT_ZOOM,
  fitPadding,
  pinSvg,
  regionCorners,
  safeColor,
  zoomForRegion,
} from '../src/map/webMapGeometry.ts';

test('a region becomes the rectangle it describes', () => {
  const corners = regionCorners({ latitude: 40.9, longitude: -73.1, latitudeDelta: 0.2, longitudeDelta: 0.4 });
  const expected = [40.8, -73.3, 41, -72.9];
  corners.flat().forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9));
});

test('coordinates become their bounding rectangle; empty or invalid lists give null', () => {
  assert.deepEqual(
    coordinatesCorners([
      { latitude: 40.92, longitude: -73.12 },
      { latitude: 40.85, longitude: -73.2 },
      { latitude: 40.95, longitude: -73.05 },
    ]),
    [
      [40.85, -73.2],
      [40.95, -73.05],
    ],
  );
  assert.equal(coordinatesCorners([]), null);
  assert.equal(coordinatesCorners([{ latitude: Number.NaN, longitude: 1 }]), null);
});

test('zoom grows as the region shrinks and stays within tile limits', () => {
  const wide = zoomForRegion({ latitude: 40.9, longitude: -73.1, latitudeDelta: 0.08, longitudeDelta: 0.08 });
  const close = zoomForRegion({ latitude: 40.9, longitude: -73.1, latitudeDelta: 0.01, longitudeDelta: 0.01 });
  assert.ok(close > wide);
  assert.ok(wide >= 10 && wide <= 14);
  assert.equal(zoomForRegion({ latitude: 0, longitude: 0, latitudeDelta: 0, longitudeDelta: 0 }), DEFAULT_ZOOM);
  assert.equal(zoomForRegion({ latitude: 0, longitude: 0, latitudeDelta: 1e-9, longitudeDelta: 1e-9 }), 19);
});

test('edge padding maps to Leaflet top-left and bottom-right padding', () => {
  assert.deepEqual(fitPadding({ top: 10, right: 20, bottom: 30, left: 40 }), {
    paddingTopLeft: [40, 10],
    paddingBottomRight: [20, 30],
  });
  assert.deepEqual(fitPadding(undefined), { paddingTopLeft: [0, 0], paddingBottomRight: [0, 0] });
});

test('dash patterns become SVG dash arrays', () => {
  assert.equal(dashArray([10, 8]), '10 8');
  assert.equal(dashArray(undefined), undefined);
  assert.equal(dashArray([]), undefined);
});

test('marker anchors default to bottom-centre like react-native-maps', () => {
  assert.equal(anchorTransform(undefined), 'translate(-50%, -100%)');
  assert.equal(anchorTransform({ x: 0.5, y: 0.5 }), 'translate(-50%, -50%)');
});

test('press and drag events carry nativeEvent.coordinate', () => {
  const event = coordinateEvent(40.9, -73.1, { action: 'marker-press' });
  assert.deepEqual(event.nativeEvent, { coordinate: { latitude: 40.9, longitude: -73.1 }, action: 'marker-press' });
  assert.equal(typeof event.stopPropagation, 'function');
});

test('pins only accept plain colour values', () => {
  assert.match(pinSvg('#990000'), /fill="#990000"/);
  assert.match(pinSvg('rgb(1, 2, 3)'), /fill="rgb\(1, 2, 3\)"/);
  assert.match(pinSvg(undefined), new RegExp(`fill="${DEFAULT_PIN_COLOR}"`));
  assert.match(pinSvg('red" onload="x'), new RegExp(`fill="${DEFAULT_PIN_COLOR}"`));
  assert.equal(safeColor('url(javascript:x)'), undefined);
});
