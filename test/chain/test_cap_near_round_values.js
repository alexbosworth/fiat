const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/outputs/cap_near_round_values');

const backgroundCount = 50000;
const countIn = (outputs, low, high) => {
  return outputs.filter(n => n >= low && n < high).length;
};

// Deterministic pseudo random numbers
const makeRandom = seed => () => {
  seed |= 0;
  seed = seed + 0x6D2B79F5 | 0;

  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);

  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;

  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

// Values spread evenly on a log scale between 100,000 and 10,000,000 sats
const makeBackground = () => {
  const random = makeRandom(1);

  return [...Array(backgroundCount).keys()].map(() => {
    return Math.round(Math.pow(10, 5 + 2 * random()));
  });
};

// The background's count in a band one percent wide
const bandShare = backgroundCount / (2 * Math.log(10)) * 0.01;

test('Values just below a round amount are capped to around them', () => {
  const random = makeRandom(2);

  // Round amounts of BTC sent with the fee taken out of the amount
  const fees = [...Array(3000).keys()].map(() => {
    return 1e6 - Math.round(1500 + random() * 1500);
  });

  const outputs = makeBackground().concat(fees);

  const capped = method({outputs}).outputs;

  const before = countIn(outputs, 995e3, 1005e3);
  const after = countIn(capped, 995e3, 1005e3);

  ok(before > 3000, 'The band held the cluster');
  ok(Math.abs(after / bandShare - 1) < 0.25, 'The band keeps the background');
  deepEqual(countIn(capped, 965e3, 995e3), countIn(outputs, 965e3, 995e3));
  deepEqual(countIn(capped, 3e6, 4e6), countIn(outputs, 3e6, 4e6), 'Far');

  return;
});

test('Values just above a round amount are capped too', () => {
  const random = makeRandom(3);

  // A service paying a fixed amount just above a round amount
  const fixed = [...Array(2000).keys()].map(() => {
    return Math.round(2004000 + random() * 2000);
  });

  const capped = method({outputs: makeBackground().concat(fixed)}).outputs;

  const after = countIn(capped, 1990e3, 2010e3);

  ok(Math.abs(after / bandShare - 1) < 0.25, 'The band keeps the background');

  return;
});

test('Exact round values are left to be capped on their own', () => {
  const exact = Array(500).fill(1e6);

  const capped = method({outputs: makeBackground().concat(exact)}).outputs;

  deepEqual(capped.filter(n => n === 1e6).length, 500, 'Exact values stay');

  return;
});

test('Values with no clear excess near round amounts are kept', () => {
  const outputs = makeBackground();

  const capped = method({outputs}).outputs;

  deepEqual(capped.length, outputs.length, 'Nothing is capped');
  deepEqual(capped.slice().sort(), outputs.slice().sort(), 'Same values');

  return;
});
