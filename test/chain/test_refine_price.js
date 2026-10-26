const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/outputs/refine_price');

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

test('A rough price is refined to the center of the payment peak', () => {
  // The rough price is a little off the true price of 50,000
  const outputs = makeOutputs({
    background: 20000,
    payments: 500,
    price: 50000,
    wiggle: 0.01,
  });

  const res = method({amounts, outputs, weights, price: 50300});

  ok(Math.abs(res.price / 50000 - 1) < 0.001, 'Price is refined');
  ok(Math.abs(res.payments / 2000 - 1) < 0.1, 'Payments are estimated');
  ok(res.significance > 10, 'The peak is significant');
  ok(res.dispersion > 0.01 && res.dispersion < 0.05, 'Dispersion is wiggle');
  deepEqual(res.is_at_edge, false, 'The peak is within the range');
  deepEqual(res.is_unsettled, undefined, 'The peak settled');

  return;
});

test('A peak still moving after five passes is unsettled', () => {
  const outputs = [];

  // Payments spread evenly over a range of prices form a plateau, not a peak
  [...Array(4000).keys()].forEach(i => {
    const price = 50000 * (0.9 + 0.2 * i / 4000);

    amounts.forEach(usd => {
      return outputs.push(Math.round(usd / price * tokensPerBigUnit));
    });
  });

  const res = method({amounts, outputs, price: 52500, weights: [1, 1, 1, 1]});

  deepEqual(res.iterations, 5, 'Recentering stops after five passes');
  deepEqual(res.is_unsettled, true, 'The peak was still moving');

  return;
});

test('A wide peak gets wider smoothing', () => {
  const outputs = makeOutputs({
    background: 20000,
    payments: 500,
    price: 50000,
    wiggle: 0.03,
  });

  const res = method({amounts, outputs, weights, price: 50000});

  ok(Math.abs(res.price / 50000 - 1) < 0.005, 'Price is refined');
  ok(res.dispersion > 0.04, 'Dispersion reflects the wider wiggle');

  return;
});

test('Background alone has no peak to refine to', () => {
  const outputs = makeOutputs({
    background: 20000,
    payments: 0,
    price: 50000,
    wiggle: 0,
  });

  const res = method({amounts, outputs, weights, price: 50000});

  ok(res.payments < 100, 'Few payments are found in noise');
  ok(res.significance < 4, 'The peak is not significant');

  return;
});

test('A peak at the edge of the range is flagged', () => {
  // The rough price is far from the true price
  const outputs = makeOutputs({
    background: 2000,
    payments: 500,
    price: 50000,
    wiggle: 0.001,
  });

  const res = method({amounts, outputs, weights, price: 54500});

  deepEqual(res.is_at_edge, true, 'The peak is at the edge');

  return;
});
