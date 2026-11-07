const {deepEqual} = require('node:assert').strict;
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

// A band holds about as many values as the background puts in it
const isBackground = count => Math.abs(count / bandShare - 1) < 0.25;

// Round amounts of BTC sent with the fee taken out of the amount
const makeFeesTakenOut = ({random}) => [...Array(3000).keys()].map(() => {
  return 1e6 - Math.round(1500 + random() * 1500);
});

// A service paying a fixed amount just above a round amount
const makeFixedAbove = ({random}) => [...Array(2000).keys()].map(() => {
  return Math.round(2004000 + random() * 2000);
});

const belowRound = makeBackground().concat(makeFeesTakenOut({
  random: makeRandom(2),
}));

const aboveRound = makeBackground().concat(makeFixedAbove({
  random: makeRandom(3),
}));

const tests = [
  {
    args: {outputs: belowRound},
    description: 'Values just below a round amount are capped to around them',
    expected: {
      far: countIn(belowRound, 3e6, 4e6),
      is_background: true,
      near: countIn(belowRound, 965e3, 995e3),
    },
    measure: ({outputs}) => ({
      far: countIn(outputs, 3e6, 4e6),
      is_background: isBackground(countIn(outputs, 995e3, 1005e3)),
      near: countIn(outputs, 965e3, 995e3),
    }),
  },
  {
    args: {outputs: aboveRound},
    description: 'Values just above a round amount are capped too',
    expected: {is_background: true},
    measure: ({outputs}) => ({
      is_background: isBackground(countIn(outputs, 1990e3, 2010e3)),
    }),
  },
  {
    args: {outputs: makeBackground().concat(Array(500).fill(1e6))},
    description: 'Exact round values are left to be capped on their own',
    expected: {exact: 500},
    measure: ({outputs}) => ({exact: outputs.filter(n => n === 1e6).length}),
  },
  {
    args: {outputs: makeBackground()},
    description: 'Values with no clear excess near round amounts are kept',
    expected: {outputs: makeBackground().sort()},
    measure: ({outputs}) => ({outputs: outputs.slice().sort()}),
  },
];

tests.forEach(({args, description, expected, measure}) => {
  return test(description, () => {
    deepEqual(measure(method(args)), expected, 'Got expected outputs');

    return;
  });
});
