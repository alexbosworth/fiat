const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/outputs/cap_repeated_values');

test('An amount repeated many times is counted ten times', () => {
  const outputs = [].concat(Array(25).fill(1186), Array(3).fill(5555), [7777]);

  const {outputs: kept} = method({outputs});

  deepEqual(kept.filter(n => n === 1186).length, 10, 'The flood is capped');
  deepEqual(kept.filter(n => n === 5555).length, 3, 'A few repeats are kept');
  deepEqual(kept.filter(n => n === 7777).length, 1, 'A single amount is kept');

  return;
});

test('Round amounts of BTC are kept as they are', () => {
  const outputs = [].concat(Array(50).fill(1e5), Array(30).fill(3000));

  deepEqual(method({outputs}).outputs, outputs, 'Round amounts are all kept');

  return;
});

test('The kept amounts stay in their order', () => {
  const outputs = [4321, 2146, 1e6].concat(Array(11).fill(2146), [5432]);

  deepEqual(
    method({outputs}).outputs,
    [4321, 2146, 1e6].concat(Array(9).fill(2146), [5432]),
    'The first repeats are kept in order'
  );

  return;
});
