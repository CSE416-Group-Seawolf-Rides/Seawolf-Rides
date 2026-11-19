import assert from 'node:assert/strict';
import test from 'node:test';

import { createWebStartAreaGeocoder } from '../src/commute/startAreaGeocoder.web.ts';

const baseUrl = 'https://photon.test';

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function place(properties, coordinates = [-73.0691257, 40.9465118]) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties };
}

function geocoder(handler) {
  const requests = [];
  const fetchImplementation = async (url, init) => {
    requests.push(url);
    return handler(url, init);
  };
  return { requests, geocoder: createWebStartAreaGeocoder({ baseUrl, fetchImplementation }) };
}

test('web address search returns the first Photon match as coordinates only', async () => {
  const { requests, geocoder: web } = geocoder(() =>
    response({
      features: [
        place({ name: 'Port Jefferson', city: 'Brookhaven', state: 'New York' }),
        place({ name: 'Port Jefferson Station' }, [-73.0657356, 40.9225875]),
      ],
    }),
  );
  assert.deepEqual(await web.findPlace('Port Jefferson, NY'), { latitude: 40.9465118, longitude: -73.0691257 });
  assert.equal(requests.length, 1);
  assert.match(requests[0], /^https:\/\/photon\.test\/api\/\?q=Port%20Jefferson%2C%20NY&/);
});

test('web address search returns null when nothing matches', async () => {
  const { geocoder: web } = geocoder(() => response({ features: [] }));
  assert.equal(await web.findPlace('Nowhere at all, NY'), null);
});

test('web address search throws when Photon is unavailable, so the step shows its error', async () => {
  const { geocoder: down } = geocoder(() => response({}, { ok: false, status: 503 }));
  await assert.rejects(down.findPlace('Port Jefferson, NY'));
  const { geocoder: offline } = geocoder(() => Promise.reject(new Error('offline')));
  await assert.rejects(offline.findPlace('Port Jefferson, NY'));
});

test('web area name uses the town from Photon reverse lookup of the given point', async () => {
  const { requests, geocoder: web } = geocoder(() =>
    response({ features: [place({ name: 'Harborfront Park', city: 'Brookhaven', district: 'Port Jefferson', county: 'Suffolk' })] }),
  );
  assert.equal(await web.areaNameFor({ latitude: 40.95, longitude: -73.07 }), 'Brookhaven');
  assert.equal(requests[0], 'https://photon.test/reverse?lat=40.95&lon=-73.07&lang=en&limit=1');
});

test('web area name falls back through district and county, and never throws', async () => {
  const name = async (handler) => geocoder(handler).geocoder.areaNameFor({ latitude: 40.9, longitude: -73.1 });
  assert.equal(await name(() => response({ features: [place({ district: 'Port Jefferson', county: 'Suffolk' })] })), 'Port Jefferson');
  assert.equal(await name(() => response({ features: [place({ county: 'Suffolk' })] })), 'Suffolk');
  assert.equal(await name(() => response({ features: [place({ name: 'Somewhere' })] })), null);
  assert.equal(await name(() => response({ features: [] })), null);
  assert.equal(await name(() => response({}, { ok: false, status: 500 })), null);
  assert.equal(await name(() => response('not json')), null);
  assert.equal(await name(() => Promise.reject(new Error('offline'))), null);
});
