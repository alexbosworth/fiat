const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const priceFromOutputs = require('./../../chain/outputs/price_from_outputs');

const {abs} = Math;
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

// Round amounts of BTC sent with the fee taken out of the amount
const makeFeesTakenOut = ({random}) => [...Array(4000).keys()].map(() => {
  return 1e6 - Math.round(1500 + random() * 1500);
});

// A flood of transactions that repeat a few small amounts through the day
const flood = {
  1046: 12086,
  1186: 9014,
  1346: 5922,
  1506: 5894,
  1666: 4222,
  1826: 4014,
  1986: 1619,
  2146: 308,
};

const repeats = Object.keys(flood).map(tokens => {
  return Array(flood[tokens]).fill(Number(tokens));
});

// Estimates are made in a window around the price
const estimate = args => priceFromOutputs(Object.assign({
  max_price: 97000,
  min_price: 50000,
},
args));

const tests = [
  {
    args: {
      cents: 6170 * centsPerDollar,
      outputs: makeOutputs({price: 6170, seed: 5}).concat(makeFeesTakenOut({
        random: makeRandom(6),
      })),
    },
    description: 'Values just off a round BTC amount are capped when asked',
    expected: {is_found: true, is_patterned: true, is_pulled: true},
    method: ({cents, outputs}) => {
      const plain = priceFromOutputs({outputs});
      const capped = priceFromOutputs({outputs, is_capping_near_round: true});

      const strong = capped.spikes.filter(n => n.strength >= 0.2);

      return {
        is_found: abs(capped.cents / cents - 1) < 0.005,
        is_patterned: strong.length >= 3,
        is_pulled: abs(plain.cents / cents - 1) > 0.5,
      };
    },
  },
  {
    args: {
      cents: 80400 * centsPerDollar,
      outputs: makeOutputs({price: 80400, seed: 7}),
    },
    description: 'A flood of a few repeated amounts does not pull the price',
    expected: {
      hundred_strength: 1,
      is_found: true,
      is_kept_out: true,
      is_significant: true,
    },
    method: ({cents, outputs}) => {
      const flooded = estimate({outputs: outputs.concat(...repeats)});
      const steady = estimate({outputs});

      return {
        hundred_strength: flooded.spikes.find(n => n.usd === 100).strength,
        is_found: abs(flooded.cents / cents - 1) < 0.005,
        is_kept_out: abs(flooded.cents / steady.cents - 1) < 0.001,
        is_significant: flooded.significance > 4,
      };
    },
  },
];

tests.forEach(({args, description, expected, method}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected price');

    return;
  });
});
