const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/outputs/cap_repeated_values');

const tests = [
  {
    args: {
      outputs: [].concat(Array(25).fill(1186), Array(3).fill(5555), [7777]),
    },
    description: 'An amount repeated many times is counted ten times',
    expected: {
      outputs: [].concat(Array(10).fill(1186), Array(3).fill(5555), [7777]),
    },
  },
  {
    args: {outputs: [].concat(Array(50).fill(1e5), Array(30).fill(3000))},
    description: 'Round amounts of BTC are kept as they are',
    expected: {outputs: [].concat(Array(50).fill(1e5), Array(30).fill(3000))},
  },
  {
    args: {outputs: [4321, 2146, 1e6].concat(Array(11).fill(2146), [5432])},
    description: 'The kept amounts stay in their order',
    expected: {outputs: [4321, 2146, 1e6].concat(Array(9).fill(2146), [5432])},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected outputs');

    return;
  });
});
