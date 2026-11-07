const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/histogram/outputs_histogram');

const {abs} = Math;
const binFor = tokens => Math.round(Math.log10(tokens) * 200);
const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);

// A thousand different values near a round value
const near = [...Array(1000).keys()].map(i => 99500 + i).filter(n => n % 1000);

// Values elsewhere so that the histogram has more than one bin
const far = [...Array(1000).keys()].map(i => 10000500 + i);

const nearby = near.concat(far);
const roundBin = binFor(100000);

const plain = method({outputs: nearby});

// The bin spans about a thousand values so a round value is one of them
const averageShare = plain.bins[roundBin] * (1 + 1 / near.length);

// The bins per decade and the total and the largest of the shares
const shapeOf = res => ({
  bins_per_decade: res.bins_per_decade,
  max: Math.max(...res.bins),
  sum: sumOf(res.bins),
});

const tests = [
  {
    args: {outputs: []},
    description: 'An empty histogram has no shares',
    expected: {bins_per_decade: 200, max: 0, sum: 0},
    measure: shapeOf,
  },
  {
    args: {outputs: [100, 1e14]},
    description: 'Outputs outside of the range are not counted',
    expected: {bins_per_decade: 200, max: 0, sum: 0},
    measure: shapeOf,
  },
  {
    args: {outputs: [10001, 10001, 10001, 100001]},
    description: 'Outputs are counted into normalized bins',
    expected: {bins_per_decade: 200, max: 0.75, sum: 1},
    measure: shapeOf,
  },
  {
    args: {outputs: [100000, 100000, 100000, 100000]},
    description: 'Round values alone do not count',
    expected: {bins_per_decade: 200, max: 0, sum: 0},
    measure: shapeOf,
  },
  {
    args: {outputs: nearby.concat(Array(5000).fill(100000))},
    description: 'A spike on a round value counts as much as an average value',
    expected: {is_flattened: true},
    measure: ({bins}) => ({
      is_flattened: abs(bins[roundBin] / averageShare - 1) < 0.01,
    }),
  },
  {
    args: {outputs: nearby.concat([100000])},
    description: 'A few payments landing on a round value are counted',
    expected: {is_counted: true},
    measure: ({bins}) => ({is_counted: bins[roundBin] > plain.bins[roundBin]}),
  },
];

tests.forEach(({args, description, expected, measure}) => {
  return test(description, () => {
    deepEqual(measure(method(args)), expected, 'Got expected histogram');

    return;
  });
});
