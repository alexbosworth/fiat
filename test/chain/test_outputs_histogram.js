const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/histogram/outputs_histogram');

const binFor = tokens => Math.round(Math.log10(tokens) * 200);

const tests = [
  {
    args: {outputs: []},
    description: 'An empty histogram has no shares',
    expected: {bins_per_decade: 200, sum: 0, max: 0},
  },
  {
    args: {outputs: [100, 1e14]},
    description: 'Outputs outside of the range are not counted',
    expected: {bins_per_decade: 200, sum: 0, max: 0},
  },
  {
    args: {outputs: [10001, 10001, 10001, 100001]},
    description: 'Outputs are counted into normalized bins',
    expected: {bins_per_decade: 200, sum: 1, max: 0.75},
  },
  {
    args: {outputs: [100000, 100000, 100000, 100000]},
    description: 'Round values alone do not count',
    expected: {bins_per_decade: 200, sum: 0, max: 0},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    const res = method(args);

    deepEqual(res.bins_per_decade, expected.bins_per_decade, 'Bins decade');
    deepEqual(res.bins.reduce((sum, n) => sum + n, 0), expected.sum, 'Sum');
    deepEqual(Math.max(...res.bins), expected.max, 'Max share');

    return;
  });
});

test('A round value counts no more than an average value in its bin', () => {
  // A thousand different values near a round value, and a spike on it
  const values = [...Array(1000).keys()].map(i => 99500 + i);

  const near = values.filter(n => n % 1000);

  // Values elsewhere so that the histogram has more than one bin
  const far = [...Array(1000).keys()].map(i => 10000500 + i);

  const nearby = near.concat(far);

  const spike = Array(5000).fill(100000);

  const plain = method({outputs: nearby});
  const spiked = method({outputs: nearby.concat(spike)});

  const bin = binFor(100000);

  // The bin spans about a thousand values so a round value is one of them
  const expected = plain.bins[bin] * (1 + 1 / near.length);

  ok(Math.abs(spiked.bins[bin] / expected - 1) < 0.01, 'Spike is flattened');

  // A few payments landing on the round value are kept
  const few = method({outputs: nearby.concat([100000])});

  ok(few.bins[bin] > plain.bins[bin], 'Round value is counted when sparse');

  return;
});
