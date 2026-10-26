const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../chain/outputs/price_from_outputs');

const centsPerDollar = 100;
const tokensPerBigUnit = 1e8;

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

// Make a day of payment outputs where people paid round USD amounts
const makeOutputs = ({price, scale, seed}) => {
  const outputs = [];
  const random = makeRandom(seed);

  const usdToTokens = usd => Math.round(usd / price * tokensPerBigUnit);

  // Background of non-round payments spread around $150
  for (let i = 0; i < 25000; i++) {
    const usd = Math.pow(10, Math.log10(150) + gaussian(random));

    outputs.push(usdToTokens(usd * (1 + 0.3 * (random() - 0.5))));
  }

  const spikes = {5: 2, 10: 6, 20: 5, 50: 10, 100: 14, 200: 6, 500: 7};

  // Spikes of round USD payments with some intraday price wiggle
  Object.keys(spikes).forEach(usd => {
    for (let i = 0; i < spikes[usd] * (scale || 100); i++) {
      const wiggled = price * (1 + 0.01 * gaussian(random));

      outputs.push(Math.round(Number(usd) / wiggled * tokensPerBigUnit));
    }
  });

  // Round BTC amounts
  [1e5, 1e6, 1e7, 5e6, 25e6, 1e8].forEach(tokens => {
    for (let i = 0; i < 100; i++) {
      outputs.push(tokens);
    }
  });

  return outputs.filter(n => n > 1000);
};

const tests = [
  {
    args: {},
    description: 'Output values are required',
    error: 'ExpectedOutputTokenValuesToDerivePriceFromOutputs',
  },
  {
    args: {outputs: []},
    description: 'Some output values are required',
    error: 'ExpectedOutputTokenValuesToDerivePriceFromOutputs',
  },
  {
    args: {max_price: 1, min_price: 2, outputs: [12345]},
    description: 'A valid price range is required',
    error: 'ExpectedValidPriceRangeToDerivePriceFromOutputs',
  },
  {
    args: {outputs: [100000, 1000000, 25000000]},
    description: 'Non-round output values are required',
    error: 'ExpectedNonRoundOutputValuesToDerivePriceFromOutputs',
  },
  {
    args: {outputs: [777, 888]},
    description: 'Output values in the analyzed range are required',
    error: 'ExpectedOutputsInAnalysisRangeToDerivePriceFromOutputs',
  },
  {
    args: {max_price: 1e8, min_price: 1e7, outputs: [1000000001, 2000000003]},
    description: 'The price range must put the outputs in view',
    error: 'ExpectedOutputsInPriceRangeToDerivePriceFromOutputs',
  },
  {
    args: {outputs: makeOutputs({price: 45000, seed: 1})},
    description: 'The price is derived from output values',
    expected: {price: 45000},
  },
  {
    args: {outputs: makeOutputs({price: 1200, seed: 2})},
    description: 'The price is derived from output values at a low price',
    expected: {price: 1200},
  },
  {
    args: {
      max_price: 150000,
      min_price: 80000,
      outputs: makeOutputs({price: 100000, seed: 3}),
    },
    description: 'The price is derived from output values within a window',
    expected: {price: 100000},
  },
  {
    args: {outputs: makeOutputs({price: 45000, scale: 8, seed: 4})},
    description: 'The price is derived from a weak signal',
    expected: {price: 45000, is_weak: true},
  },
  {
    args: {
      max_price: 90000,
      min_price: 50000,
      outputs: makeOutputs({price: 100000, seed: 3}),
    },
    description: 'A window below the price finds the alias at its edge',
    expected: {price: 50000, is_alias: true},
  },
  {
    args: {
      max_price: 60000,
      min_price: 31000,
      outputs: makeOutputs({price: 100000, seed: 3}),
    },
    description: 'A window around an alias is beaten by the price outside it',
    expected: {price: 50000, is_alias: true, is_inside: true},
  },
  {
    args: {outputs: [5000000001, 7000000003]},
    description: 'A couple of outputs are not a significant price',
    expected: {is_insignificant: true},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, () => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');

      return;
    }

    const res = method(args);

    if (!!expected.is_insignificant) {
      ok(res.payments < 100, 'Too few payments');
      ok(res.significance < 4, 'The payment peak is not significant');
      ok(res.cents > 0, 'A price is still returned');
      deepEqual(res.confidence, 100, 'Without a competing alias it is capped');

      return;
    }

    const cents = expected.price * centsPerDollar;

    ok(res.payments > 0, 'Payments were found');
    ok(res.significance > 4, 'The payment peak is significant');
    ok(Math.abs(res.rough_cents / cents - 1) < 0.02, 'Rough price is close');
    ok(Math.abs(res.cents / cents - 1) < 0.005, 'Price is derived');
    ok(res.dispersion > 0.01 && res.dispersion < 0.05, 'Dispersion is wiggle');
    ok(res.coverage > 0.2 && res.coverage <= 1, 'Coverage is a share');
    ok(res.rivalry >= 0 && res.rivalry < 0.5, 'No rival position fits well');

    if (!!expected.is_alias) {
      ok(res.confidence < 1, 'An alias outside the window scores better');
      ok(res.agreement < 0.7, 'Spike strengths disagree with the prior');
      deepEqual(res.is_at_edge, !expected.is_inside, 'Alias is at the edge');

      // At half the price the real hundred dollar spike looks like fifty
      deepEqual(res.spikes.find(n => n.usd === 50).strength, 1, 'Strongest');

      return;
    }

    deepEqual(res.spikes.find(n => n.usd === 100).strength, 1, 'Strongest');
    ok(res.confidence > 1.1, 'The price is told apart from its aliases');
    ok(res.agreement > 0.8, 'Spike strengths agree with the prior');
    deepEqual(res.is_at_edge, false, 'The price is within the window');

    if (!!expected.is_weak) {
      ok(res.payments < 500, 'Few payments were found');
    } else {
      ok(res.payments > 4000, 'Payments are counted');
    }

    return;
  });
});
