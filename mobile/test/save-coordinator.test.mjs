import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SaveCoordinator,
  SavePendingError,
  saveErrorMessage,
} from '../src/persistence/saveCoordinator.ts';

test('a disconnected save returns a recoverable pending error instead of waiting forever', async () => {
  const coordinator = new SaveCoordinator(10);
  const commit = Promise.withResolvers();

  await assert.rejects(coordinator.run('profile', () => commit.promise), SavePendingError);
  commit.resolve();
});

test('retrying a timed-out save waits on the original write without submitting it again', async () => {
  const coordinator = new SaveCoordinator(10);
  const commit = Promise.withResolvers();
  let writes = 0;
  const save = () => {
    writes += 1;
    return commit.promise;
  };

  await assert.rejects(coordinator.run('profile', save), SavePendingError);
  const retry = coordinator.run('profile', save);
  commit.resolve();
  await retry;

  assert.equal(writes, 1);
});

test('a late acknowledgement still applies the saved data exactly once', async () => {
  const coordinator = new SaveCoordinator(10);
  const commit = Promise.withResolvers();
  let applied = 0;
  const completion = commit.promise.then(() => {
    applied += 1;
  });

  await assert.rejects(coordinator.run('profile', () => completion), SavePendingError);
  assert.equal(applied, 0);
  commit.resolve();
  await completion;

  assert.equal(applied, 1);
});

test('a conflicting change is blocked until the previous write completes', async () => {
  const coordinator = new SaveCoordinator(10);
  const commit = Promise.withResolvers();
  let secondWrites = 0;
  const secondSave = async () => { secondWrites += 1; };

  await assert.rejects(coordinator.run('driver', () => commit.promise), SavePendingError);
  await assert.rejects(coordinator.run('rider', secondSave), /previous change/);
  assert.equal(secondWrites, 0);

  const original = coordinator.run('driver', () => assert.fail('must reuse the pending write'));
  commit.resolve();
  await original;
  await coordinator.run('rider', secondSave);
  assert.equal(secondWrites, 1);
});

test('concurrent identical attempts share one successful write', async () => {
  const coordinator = new SaveCoordinator(100);
  const commit = Promise.withResolvers();
  let writes = 0;
  const save = () => { writes += 1; return commit.promise; };
  const first = coordinator.run('commute', save);
  const second = coordinator.run('commute', save);

  commit.resolve();
  await Promise.all([first, second]);
  assert.equal(writes, 1);
});

test('server rejection is preserved and a new attempt can succeed', async () => {
  const coordinator = new SaveCoordinator(100);
  const denied = new Error('permission-denied');

  await assert.rejects(coordinator.run('profile', async () => { throw denied; }), (error) => error === denied);
  await coordinator.run('profile', async () => {});
});

test('rejection after a timeout releases the pending write for retry', async () => {
  const coordinator = new SaveCoordinator(10);
  const commit = Promise.withResolvers();

  await assert.rejects(coordinator.run('profile', () => commit.promise), SavePendingError);
  const retry = coordinator.run('profile', () => assert.fail('must reuse the pending write'));
  const denied = new Error('permission-denied');
  commit.reject(denied);
  await assert.rejects(retry, (error) => error === denied);
  await coordinator.run('profile', async () => {});
});

test('save alerts distinguish pending writes from failed writes', () => {
  const pending = new SavePendingError();
  assert.equal(saveErrorMessage(pending, 'Failed'), pending.message);
  assert.equal(saveErrorMessage(new Error('permission-denied'), 'Failed'), 'Failed');
});
