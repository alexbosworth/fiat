const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../chain/histogram/histogram_excess');

const {abs} = Math;
const flat = Array(50).fill(1);

const spiked = flat.map((n, i) => i === 25 ? 5 : n);

const tests = [
  {
    args: {},
    description: 'Histogram bins are required',
    error: 'ExpectedHistogramBinsToCalculateHistogramExcess',
  },
  {
    args: {bins: [3]},
    description: 'A lone bin has no background',
    expected: {background: [0], excess: [3]},
  },
  {
    args: {bins: flat},
    description: 'A flat histogram has no excess',
    expected: {background: flat, excess: Array(50).fill(0)},
  },
  {
    args: {bins: spiked},
    description: 'A spike has excess over the background',
    expected: {background: flat, excess: flat.map((n, i) => i === 25 ? 4 : 0)},
  },
  {
    args: {bins: [1, 1, 9, 1, 1], exclude: 0, radius: 4},
    description: 'The background reach and exclusion can be set',
    expected: {background: [1, 1, 1, 1, 1], excess: [0, 0, 8, 0, 0]},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, () => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected result');
    }

    return;
  });
});

test('The background is the lower median of the neighbors of a bin', () => {
  // Shares that repeat and include empty bins
  const bins = [...Array(80).keys()].map(n => n * 7919 % 31 % 9 / 10);

  // The background of each bin from sorting all of its neighbors
  const sortedMedians = ({exclude, radius}) => bins.map((share, bin) => {
    const neighbors = bins
      .filter((n, i) => abs(i - bin) > exclude && abs(i - bin) <= radius)
      .sort((a, b) => a - b);

    return !neighbors.length ? 0 : neighbors[(neighbors.length - 1) >>> 1];
  });

  [[0, 1], [2, 12], [3, 3], [5, 2], [2, 80]].forEach(([exclude, radius]) => {
    const {background} = method({bins, exclude, radius});

    deepEqual(background, sortedMedians({exclude, radius}), 'Got median');

    return;
  });

  return;
});
