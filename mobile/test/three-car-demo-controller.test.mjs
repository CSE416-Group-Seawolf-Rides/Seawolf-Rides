import assert from 'node:assert/strict';
import test from 'node:test';

import { acceptedPlanPresentationGeometry, ThreeCarDemoController, schematicPlan } from '../src/matching/threeCarDemoController.ts';
import { DEMO3X7_LIVE_STATIONS } from '../src/matching/demo3x7LiveInputs.ts';

const byKey = (items, key) => items.find((item) => item.id.includes(`-${key}-`));

test('three-car demo load is explicit, idempotent, and creates no requests or memberships', () => {
  const controller = new ThreeCarDemoController();
  assert.equal(controller.getSnapshot().mode, 'LIVE');
  assert.equal(controller.getSnapshot().scenario, null);
  assert.equal(controller.loadData(), true);
  const first = controller.getSnapshot().scenario;
  assert.equal(first.driverOccurrences.length, 3);
  assert.equal(first.riderIntents.length, 7);
  assert.equal(first.pendingRequests.length, 0);
  assert.equal(first.acceptedMemberships.length, 0);
  assert.equal(first.combinedPlans.length, 0);
  assert.equal(controller.getSnapshot().diagnostics.directedLegProviderRequests, 0);
  assert.equal(controller.getSnapshot().diagnostics.geometryRequests, 0);
  assert.equal(first.riderIntents.every((intent) => intent.pickup.status === 'CONFIRMED'), true);
  assert.deepEqual(byKey(first.riderIntents, 'ava').pickup.point.coordinate, DEMO3X7_LIVE_STATIONS.A.coordinate);
  assert.deepEqual(byKey(first.riderIntents, 'grace').pickup.point.coordinate, DEMO3X7_LIVE_STATIONS.G.coordinate);
  assert.equal(controller.loadData(), false);
  assert.equal(controller.getSnapshot().scenario.generationId, first.generationId);
  controller.dispose();
});

test('fixture presentation uses group recommendations, acceptance, and exact cancellation', async () => {
  const controller = new ThreeCarDemoController();
  controller.reset({ mode: 'FIXTURE' });
  controller.loadData();
  const initial = await controller.findMatches();
  assert.equal(initial.status, 'COMPLETE');
  assert.deepEqual(initial.summary, { feasible: 9, infeasible: 9, unknown: 3, excluded: 0 });

  let scenario = controller.getSnapshot().scenario;
  const jordan = byKey(scenario.driverOccurrences, 'jordan');
  const ava = byKey(scenario.riderIntents, 'ava');
  controller.selectDriver(jordan.id);
  controller.selectRider(ava.id);
  const acceptedAva = await controller.acceptSelected();
  assert.equal(acceptedAva.code, 'ACCEPTED');
  scenario = controller.getSnapshot().scenario;
  assert.equal(scenario.pendingRequests.length, 0);
  assert.equal(scenario.acceptedMemberships.length, 1);

  const ben = byKey(scenario.riderIntents, 'ben');
  const benEdge = controller.getSnapshot().recommendations.recommendations.find((item) => item.driverOccurrenceId === jordan.id && item.riderIntentId === ben.id);
  assert.equal(benEdge.status, 'INFEASIBLE');

  const chloe = byKey(scenario.riderIntents, 'chloe');
  controller.selectRider(chloe.id);
  const chloeEdge = controller.selectedRecommendation();
  assert.equal(chloeEdge.status, 'FEASIBLE');
  assert.equal(chloeEdge.metrics.incrementalAddedDriverDurationSeconds, 7 * 60);
  assert.equal(chloeEdge.metrics.totalAddedDriverDurationSeconds, 9 * 60);
  const acceptedChloe = await controller.acceptSelected();
  assert.equal(acceptedChloe.code, 'ACCEPTED');
  assert.equal(acceptedChloe.plan.vehicleCampusArrival, Date.parse('2026-10-19T08:49:00-04:00') / 1000);
  assert.equal(schematicPlan(acceptedChloe.plan, jordan).length, 4);

  scenario = controller.getSnapshot().scenario;
  const avaMembership = scenario.acceptedMemberships.find((item) => item.riderParticipantId.endsWith('-ava'));
  const cancelled = await controller.cancelMembership(avaMembership.requestId);
  assert.equal(cancelled.code, 'CANCELLED_MEMBERSHIP');
  scenario = controller.getSnapshot().scenario;
  assert.equal(scenario.acceptedMemberships.length, 1);
  assert.equal(scenario.acceptedMemberships[0].riderParticipantId.endsWith('-chloe'), true);
  assert.equal(scenario.combinedPlans[0].riderPromises[0].riderParticipantId.endsWith('-chloe'), true);
  controller.dispose();
});

test('mode and date changes reset only the isolated generation', () => {
  const controller = new ThreeCarDemoController();
  controller.reset({ mode: 'FIXTURE' });
  controller.loadData();
  const original = controller.getSnapshot().scenario.generationId;
  controller.reset({ mode: 'LIVE', localDate: '2026-10-20' });
  assert.equal(controller.getSnapshot().scenario, null);
  assert.equal(controller.getSnapshot().mode, 'LIVE');
  assert.equal(controller.getSnapshot().localDate, '2026-10-20');
  controller.reset({ mode: 'FIXTURE' });
  controller.loadData();
  const moved = controller.getSnapshot().scenario;
  assert.notEqual(moved.generationId, original);
  assert.equal(moved.driverOccurrences[0].occurrence.localDate, '2026-10-20');
  assert.equal(moved.riderIntents[0].pickupWindow.earliest, Date.parse('2026-10-20T08:10:00-04:00') / 1000);
  controller.dispose();
});

test('live accepted plans never fall back to schematic presentation geometry', async () => {
  const controller = new ThreeCarDemoController();
  controller.reset({ mode: 'FIXTURE' });
  controller.loadData();
  await controller.findMatches();
  const scenario = controller.getSnapshot().scenario;
  const jordan = byKey(scenario.driverOccurrences, 'jordan');
  const ava = byKey(scenario.riderIntents, 'ava');
  controller.selectDriver(jordan.id);
  controller.selectRider(ava.id);
  const accepted = await controller.acceptSelected();
  assert.equal(accepted.ok, true);
  assert.equal(acceptedPlanPresentationGeometry({ mode: 'LIVE', plan: accepted.plan, driver: jordan }), null);
  assert.deepEqual(acceptedPlanPresentationGeometry({ mode: 'FIXTURE', plan: accepted.plan, driver: jordan }), schematicPlan(accepted.plan, jordan));
  const roadGeometry = [{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }];
  const copied = acceptedPlanPresentationGeometry({ mode: 'LIVE', roadGeometry, plan: accepted.plan, driver: jordan });
  assert.deepEqual(copied, roadGeometry);
  assert.notEqual(copied, roadGeometry);
  controller.dispose();
});

test('walkthrough B keeps commitments global, capacities car-scoped, and duplicate taps inert', async () => {
  const controller = new ThreeCarDemoController();
  controller.reset({ mode: 'FIXTURE' });
  controller.loadData();
  await controller.findMatches();
  let scenario = controller.getSnapshot().scenario;
  const morgan = byKey(scenario.driverOccurrences, 'morgan');
  const taylor = byKey(scenario.driverOccurrences, 'taylor');
  const jordan = byKey(scenario.driverOccurrences, 'jordan');
  const ben = byKey(scenario.riderIntents, 'ben');
  const chloe = byKey(scenario.riderIntents, 'chloe');
  const diego = byKey(scenario.riderIntents, 'diego');

  controller.selectDriver(morgan.id);
  controller.selectRider(ben.id);
  const firstTap = controller.acceptSelected();
  assert.equal(await controller.acceptSelected(), null);
  assert.equal((await firstTap).code, 'ACCEPTED');
  controller.selectRider(chloe.id);
  assert.equal((await controller.acceptSelected()).code, 'ACCEPTED');
  scenario = controller.getSnapshot().scenario;
  assert.equal(scenario.acceptedMemberships.filter((item) => item.driverOccurrenceId === morgan.id).reduce((sum, item) => sum + item.requestedSeats, 0), 3);
  const morganDiego = controller.getSnapshot().recommendations.recommendations.find((item) => item.driverOccurrenceId === morgan.id && item.riderIntentId === diego.id);
  assert.deepEqual(morganDiego.reasonCodes, ['NO_SEAT']);

  controller.selectDriver(taylor.id);
  controller.selectRider(diego.id);
  assert.equal((await controller.acceptSelected()).code, 'ACCEPTED');
  const jordanChloe = controller.getSnapshot().recommendations.recommendations.find((item) => item.driverOccurrenceId === jordan.id && item.riderIntentId === chloe.id);
  assert.equal(jordanChloe.status, 'EXCLUDED');
  assert.deepEqual(jordanChloe.reasonCodes, ['RIDER_COMMITTED_TO_ANOTHER_CAR']);

  scenario = controller.getSnapshot().scenario;
  const chloeMembership = scenario.acceptedMemberships.find((item) => item.driverOccurrenceId === morgan.id && item.riderParticipantId.endsWith('-chloe'));
  assert.equal((await controller.cancelMembership(chloeMembership.requestId)).code, 'CANCELLED_MEMBERSHIP');
  const jordanChloeAfter = controller.getSnapshot().recommendations.recommendations.find((item) => item.driverOccurrenceId === jordan.id && item.riderIntentId === chloe.id);
  assert.equal(jordanChloeAfter.status, 'FEASIBLE');
  controller.dispose();
});
