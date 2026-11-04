#!/usr/bin/env node
// Car demo driver for the Android Automotive emulator.
//
//   npm run car:demo                 # default 250 m/s playback (~5 min for the whole route)
//   npm run car:demo -- --mps 300    # faster
//   npm run car:demo -- --serial emulator-5554
//
// 1. Sets the emulator GPS to the Queens origin (what the car's "West Side" route starts from).
// 2. Waits for you to pick West Side -> Start in the car UI and press Enter here.
// 3. Replays the recorded route's coordinates about once a second via `adb emu geo fix`, so
//    maneuvers advance, ETA counts down and the car arrives. No routing server is contacted.
//
// Playback speed is deliberately much faster than driving speed: the route is 75 km. The app's
// progress tracker rejects fixes faster than ~70 m/s, so in dev builds the car controller warps
// its clock by RECORDED_ROUTE_TIME_WARP (5x) for this recorded route: 250 m/s here reads as
// 50 m/s there. Keep --mps <= 14 * warp (350 by default) or fixes get rejected as implausible.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};
const METERS_PER_SECOND = Number(flag('mps', '250'));
const SERIAL = flag('serial', 'emulator-5554');
const TICK_MS = 1000;
const HOLD_TICKS_AT_END = 8; // repeated fixes so arrival is confirmed
const MAX_MPS = 350;
if (!Number.isFinite(METERS_PER_SECOND) || METERS_PER_SECOND <= 0 || METERS_PER_SECOND > MAX_MPS) {
  console.error(`--mps must be between 1 and ${MAX_MPS} (the app time-warps playback 5x; faster fixes are rejected as implausible)`);
  process.exit(1);
}

function findAdb() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    process.env.HOME && path.join(process.env.HOME, 'Library', 'Android', 'sdk'),
    process.env.HOME && path.join(process.env.HOME, 'Android', 'Sdk'),
  ].filter(Boolean);
  for (const root of roots) {
    const candidate = path.join(root, 'platform-tools', exe);
    if (fs.existsSync(candidate)) return candidate;
  }
  return exe; // fall back to PATH
}
const ADB = findAdb();

async function geoFix({ latitude, longitude }) {
  // The emulator console takes longitude first.
  await run(ADB, ['-s', SERIAL, 'emu', 'geo', 'fix', String(longitude), String(latitude)]);
}

const toRad = (deg) => (deg * Math.PI) / 180;
function haversine(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Points spaced `stepMeters` apart along the polyline, always ending on the last vertex. */
function resample(points, stepMeters) {
  const out = [points[0]];
  let carried = 0; // distance travelled since the last emitted point
  for (let i = 1; i < points.length; i += 1) {
    let from = points[i - 1];
    const to = points[i];
    let segment = haversine(from, to);
    while (carried + segment >= stepMeters && segment > 0) {
      const t = (stepMeters - carried) / segment;
      const next = {
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
      };
      out.push(next);
      segment -= stepMeters - carried;
      carried = 0;
      from = next;
    }
    carried += segment;
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (tail.latitude !== last.latitude || tail.longitude !== last.longitude) out.push(last);
  return out;
}

let fixture;
try {
  fixture = await import('../src/car/devFixtures/queensToCampus.ts');
} catch (error) {
  console.error('Could not load the route fixture. This script needs Node >= 22.18 (native TypeScript stripping).');
  console.error(error);
  process.exit(1);
}
const route = fixture.queensToCampusOsrmResponse.routes[0];
const polyline = route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
const stepMeters = METERS_PER_SECOND * (TICK_MS / 1000);
const track = resample(polyline, stepMeters);
const totalSeconds = Math.round((track.length * TICK_MS) / 1000);

console.log(`Route: ${(route.distance / 1000).toFixed(1)} km, ${polyline.length} points -> ${track.length} fixes`);
console.log(`Playback: ${METERS_PER_SECOND} m/s, ~${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} s, device ${SERIAL}`);

try {
  await geoFix(fixture.QUEENS_ORIGIN);
} catch (error) {
  console.error(`adb emu geo fix failed on ${SERIAL}. Is the emulator running? (${ADB})`);
  console.error(error.stderr || error.message);
  process.exit(1);
}
console.log('\nGPS set to the Queens origin (Jamaica, Queens).');
console.log('In the car: open "Where to?" -> West Side -> wait for the route preview -> tap Start.');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('Press Enter here once navigation has started to begin the drive... ');
rl.close();

let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
  console.log('\nStopped. GPS left at the last fix.');
});

const started = Date.now();
for (let i = 0; i < track.length && !stopped; i += 1) {
  const tickStart = Date.now();
  await geoFix(track[i]);
  if (i % 10 === 0 || i === track.length - 1) {
    const pct = Math.round((i / (track.length - 1)) * 100);
    process.stdout.write(`\r  driving... ${pct}%  (${Math.round((Date.now() - started) / 1000)} s)   `);
  }
  const wait = TICK_MS - (Date.now() - tickStart);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}
for (let i = 0; i < HOLD_TICKS_AT_END && !stopped; i += 1) {
  await geoFix(track[track.length - 1]);
  await new Promise((resolve) => setTimeout(resolve, TICK_MS));
}
if (!stopped) console.log('\nArrived. Done.');
