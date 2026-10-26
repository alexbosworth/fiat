const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/histogram/parabola_peak');

const tests = [
  {
    args: {above: 1, below: 1, center: 2},
    description: 'A symmetric peak is at the center',
    expected: {delta: 0},
  },
  {
    args: {above: 2, below: 0, center: 2},
    description: 'A peak leaning above is offset above',
    expected: {delta: 0.5},
  },
  {
    args: {above: 1, below: 1, center: 0},
    description: 'A valley has no peak offset',
    expected: {delta: 0},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected result');

    return;
  });
});
