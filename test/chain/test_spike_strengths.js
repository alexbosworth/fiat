const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../chain/histogram/spike_strengths');

test('The excess of the histogram is required', () => {
  throws(
    () => method({}),
    new Error('ExpectedHistogramExcessToMeasureSpikeStrengths'),
    'Got expected error'
  );

  return;
});

test('The strength of a spike is measured around each bin', () => {
  // A spike in the third bin that spills into the fourth
  const {strengths} = method({excess: [0, 0, 1, 0.5, 0, 0, 0]});

  const expected = [0.3, 0.85, 1.35, 1.2, 0.65, 0.15, 0];

  deepEqual(strengths.length, expected.length, 'Every bin has a strength');

  strengths.forEach((strength, bin) => {
    ok(Math.abs(strength - expected[bin]) < 1e-9, 'Got expected strength');

    return;
  });

  return;
});
