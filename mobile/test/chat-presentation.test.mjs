import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatThreadTimestamp,
  formatBubbleTime,
  getThreadBadge,
} from '../src/chat/chatPresentation.ts';

test('formatThreadTimestamp formats today times as hour and minute', () => {
  // 2026-10-30 14:30:00 EDT = 1793471400000 ms
  const testDate = new Date('2026-10-30T14:30:00-04:00').getTime();
  const now = new Date('2026-10-30T16:00:00-04:00').getTime();
  const formatted = formatThreadTimestamp(testDate, now);
  assert.equal(formatted, '2:30 PM');
});

test('formatThreadTimestamp formats yesterday as "Yesterday"', () => {
  const testDate = new Date('2026-10-29T10:00:00-04:00').getTime();
  const now = new Date('2026-10-30T16:00:00-04:00').getTime();
  const formatted = formatThreadTimestamp(testDate, now);
  assert.equal(formatted, 'Yesterday');
});

test('formatThreadTimestamp formats days within the week with weekday short name', () => {
  // 3 days before Friday Oct 30 is Tuesday Oct 27
  const testDate = new Date('2026-10-27T10:00:00-04:00').getTime();
  const now = new Date('2026-10-30T16:00:00-04:00').getTime();
  const formatted = formatThreadTimestamp(testDate, now);
  assert.equal(formatted, 'Tue');
});

test('formatThreadTimestamp formats older dates in same year as Month Day', () => {
  // 3 weeks before Oct 30: Oct 9
  const testDate = new Date('2026-10-09T10:00:00-04:00').getTime();
  const now = new Date('2026-10-30T16:00:00-04:00').getTime();
  const formatted = formatThreadTimestamp(testDate, now);
  assert.equal(formatted, 'Oct 9');
});

test('formatThreadTimestamp formats previous year dates with year', () => {
  const testDate = new Date('2025-11-15T10:00:00-05:00').getTime();
  const now = new Date('2026-10-30T16:00:00-04:00').getTime();
  const formatted = formatThreadTimestamp(testDate, now);
  assert.equal(formatted, '11/15/25');
});

test('formatThreadTimestamp returns empty string on invalid or zero timestamp', () => {
  assert.equal(formatThreadTimestamp(0), '');
  assert.equal(formatThreadTimestamp(NaN), '');
});

test('formatBubbleTime formats message timestamp to hour:minute', () => {
  const testDate = new Date('2026-10-30T09:15:00-04:00').getTime();
  assert.equal(formatBubbleTime(testDate), '9:15 AM');
  assert.equal(formatBubbleTime(0), '');
});

test('getThreadBadge identifies driver and rider roles relative to current user', () => {
  const threadWithDriver = {
    id: 'thread-1',
    participantIds: ['driver-uid', 'rider-uid'],
    names: { 'driver-uid': 'Alex', 'rider-uid': 'Maya' },
    localDate: '2026-10-30',
    campusLabel: 'Tabler',
    createdAt: 100,
    updatedAt: 200,
    messageCount: 5,
    lastMessage: 'On my way',
    trip: {
      driverId: 'driver-uid',
      riderId: 'rider-uid',
      localDate: '2026-10-30',
      campusLabel: 'Tabler',
      departure: 1000,
      pickup: 1100,
      vehicleCampusArrival: 1300,
    },
  };

  // From rider's perspective, partner is the Driver
  const riderPerspective = getThreadBadge(threadWithDriver, 'rider-uid');
  assert.deepEqual(riderPerspective, { label: 'Driver', isDriver: true });

  // From driver's perspective, partner is the Rider
  const driverPerspective = getThreadBadge(threadWithDriver, 'driver-uid');
  assert.deepEqual(driverPerspective, { label: 'Rider', isDriver: false });

  // Without trip details, returns null
  const threadWithoutTrip = { ...threadWithDriver, trip: undefined };
  assert.equal(getThreadBadge(threadWithoutTrip, 'rider-uid'), null);
});

