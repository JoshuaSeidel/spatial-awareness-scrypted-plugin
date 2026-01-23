import assert from 'assert/strict';
import {
  getActiveAlertKey,
  hasMeaningfulAlertChange,
  shouldSendUpdateNotification,
} from '../src/alerts/alert-utils';

async function testAlertUpdateHelpers(): Promise<void> {
  const prev = {
    cameraId: 'cam-1',
    objectLabel: 'Person at front',
    involvedLandmarks: ['Front Door'],
  };

  const same = {
    cameraId: 'cam-1',
    objectLabel: 'Person at front',
    involvedLandmarks: ['Front Door'],
  };

  const changed = {
    cameraId: 'cam-2',
    objectLabel: 'Person moving to driveway',
    involvedLandmarks: ['Driveway'],
  };

  assert.equal(hasMeaningfulAlertChange(prev, same), false);
  assert.equal(hasMeaningfulAlertChange(prev, changed), true);

  const key = getActiveAlertKey('movement', 'movement', 'obj-1');
  assert.equal(key, 'movement:movement:obj-1');

  const now = Date.now();
  assert.equal(shouldSendUpdateNotification(false, now - 100000, now, 60000), false);
  assert.equal(shouldSendUpdateNotification(true, now - 100000, now, 60000), true);
  assert.equal(shouldSendUpdateNotification(true, now - 1000, now, 60000), false);
  assert.equal(shouldSendUpdateNotification(true, now - 1000, now, 0), true);
}

async function run(): Promise<void> {
  await testAlertUpdateHelpers();
  // eslint-disable-next-line no-console
  console.log('All tests passed');
}

run().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
