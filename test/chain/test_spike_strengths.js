const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../chain/histogram/spike_strengths');

const rounded = n => Math.round(n * 1e9) / 1e9;

// The strengths of spikes, rounded past the noise of floating point math
const strengthsOf = args => ({strengths: method(args).strengths.map(rounded)});

const tests = [
  {
    args: {},
    description: 'The excess of the histogram is required',
    error: 'ExpectedHistogramExcessToMeasureSpikeStrengths',
  },
  {
    args: {excess: [0, 0, 1, 0.5, 0, 0, 0]},
    description: 'A spike spilling into the next bin is measured at each bin',
    expected: {strengths: [0.3, 0.85, 1.35, 1.2, 0.65, 0.15, 0]},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, () => {
    if (!!error) {
      throws(() => strengthsOf(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(strengthsOf(args), expected, 'Got expected strengths');
    }

    return;
  });
});
