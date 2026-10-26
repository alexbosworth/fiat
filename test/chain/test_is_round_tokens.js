const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/histogram/is_round_tokens');

const tests = [
  {
    args: {tokens: 100000},
    description: 'A multiple of a thousand sats is round',
    expected: {is_round: true},
  },
  {
    args: {tokens: 25000000},
    description: 'A quarter of a BTC is round',
    expected: {is_round: true},
  },
  {
    args: {tokens: 500},
    description: 'Five hundred sats is round',
    expected: {is_round: true},
  },
  {
    args: {tokens: 2000},
    description: 'Two thousand sats is round',
    expected: {is_round: true},
  },
  {
    args: {tokens: 123456},
    description: 'An arbitrary amount is not round',
    expected: {is_round: false},
  },
  {
    args: {tokens: 1500},
    description: 'Fifteen hundred sats is not round',
    expected: {is_round: false},
  },
  {
    args: {tokens: 30},
    description: 'Thirty sats is not round',
    expected: {is_round: false},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected result');

    return;
  });
});
