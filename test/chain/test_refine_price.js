const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/outputs/refine_price');

const {abs} = Math;
const amounts = [10, 20, 50, 100];
const tokensPerBigUnit = 1e8;
const weights = [0.5, 0.5, 0.6, 1];

// Deterministic pseudo random numbers
const makeRandom = seed => () => {
  seed |= 0;
  seed = seed + 0x6D2B79F5 | 0;

  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);

  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;

  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const gaussian = random => {
  const u = 1 - random();
  const v = random();

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// Make outputs with round payments at a price and a background
const makeOutputs = ({background, payments, price, wiggle}) => {
  const outputs = [];
  const random = makeRandom(1);

  for (let i = 0; i < background; i++) {
    const usd = Math.pow(10, Math.log10(50) + gaussian(random));

    outputs.push(Math.round(usd / price * tokensPerBigUnit));
  }

  amounts.forEach(usd => {
    for (let i = 0; i < payments; i++) {
      const wiggled = price * (1 + wiggle * gaussian(random));

      outputs.push(Math.round(usd / wiggled * tokensPerBigUnit));
    }
  });

  return outputs;
};

// Payments spread evenly over a range of prices form a plateau, not a peak
const makePlateau = () => {
  return [].concat(...[...Array(4000).keys()].map(i => {
    const price = 50000 * (0.9 + 0.2 * i / 4000);

    return amounts.map(usd => Math.round(usd / price * tokensPerBigUnit));
  }));
};

const tests = [
  {
    args: {
      amounts,
      weights,
      outputs: makeOutputs({
        background: 20000,
        payments: 500,
        price: 50000,
        wiggle: 0.01,
      }),
      price: 50300,
    },
    description: 'A rough price is refined to the center of the payment peak',
    expected: {
      is_at_edge: false,
      is_dispersed: true,
      is_estimated: true,
      is_refined: true,
      is_significant: true,
      is_unsettled: undefined,
    },
    measure: res => ({
      is_at_edge: res.is_at_edge,
      is_dispersed: res.dispersion > 0.01 && res.dispersion < 0.05,
      is_estimated: abs(res.payments / 2000 - 1) < 0.1,
      is_refined: abs(res.price / 50000 - 1) < 0.001,
      is_significant: res.significance > 10,
      is_unsettled: res.is_unsettled,
    }),
  },
  {
    args: {
      amounts,
      outputs: makePlateau(),
      price: 52500,
      weights: [1, 1, 1, 1],
    },
    description: 'A peak still moving after five passes is unsettled',
    expected: {is_unsettled: true, iterations: 5},
    measure: res => ({
      is_unsettled: res.is_unsettled,
      iterations: res.iterations,
    }),
  },
  {
    args: {
      amounts,
      weights,
      outputs: makeOutputs({
        background: 20000,
        payments: 500,
        price: 50000,
        wiggle: 0.03,
      }),
      price: 50000,
    },
    description: 'A wide peak gets wider smoothing',
    expected: {is_refined: true, is_wide: true},
    measure: res => ({
      is_refined: abs(res.price / 50000 - 1) < 0.005,
      is_wide: res.dispersion > 0.04,
    }),
  },
  {
    args: {
      amounts,
      weights,
      outputs: makeOutputs({
        background: 20000,
        payments: 0,
        price: 50000,
        wiggle: 0,
      }),
      price: 50000,
    },
    description: 'Background alone has no peak to refine to',
    expected: {is_few_payments: true, is_insignificant: true},
    measure: res => ({
      is_few_payments: res.payments < 100,
      is_insignificant: res.significance < 4,
    }),
  },
  {
    args: {
      amounts,
      weights,
      outputs: makeOutputs({
        background: 2000,
        payments: 500,
        price: 50000,
        wiggle: 0.001,
      }),
      price: 54500,
    },
    description: 'A peak far from the rough price is flagged at the edge',
    expected: {is_at_edge: true},
    measure: res => ({is_at_edge: res.is_at_edge}),
  },
];

tests.forEach(({args, description, expected, measure}) => {
  return test(description, () => {
    deepEqual(measure(method(args)), expected, 'Got expected refinement');

    return;
  });
});
