const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const {makeStore} = require('./../fixtures');
const method = require('./../../chain/estimates/get_price_for_date');
const {methodVersion} = require('./../../chain/known');

const centsPerDollar = 100;

// Chains start well after the earliest supported day
const genesis = Date.parse('2026-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

test('A supported starting price is required', async () => {
  // A chain of days whose payments never form a supported pattern
  const flat = makeChain({
    days: 8,
    payments_per_block: 10,
    prices: [40123, 42345, 57890, 55555, 56789, 51234, 49876, 52345, 53456],
    spike_weights: {10: 1, 20: 1, 50: 1, 100: 1},
  });

  const store = makeStore({});

  // The latest complete day and the six days before it are tried
  const days = [7, 6, 5, 4, 3, 2, 1].map(n => flat.day_name(n));

  await rejects(
    method({
      date: flat.day(1),
      get_prices: store.get_prices,
      height: flat.tip,
      lnd: flat.lnd,
      put_price: store.put_price,
    }),
    [503, 'FailedToFindSupportedStartingPrice', {days}],
    'No day is supported as a starting day'
  );

  return;
});

test('An unsupported latest day is stepped back from', async () => {
  // The latest complete day has no round payments at all
  const chain = makeChain({quiet_days: [3]});
  const logs = [];
  const store = makeStore({});

  const res = await method({
    date: chain.day(1),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    logger: {info: log => logs.push(log)},
    put_price: store.put_price,
  });

  const expected = chain.prices[chain.day_name(1)] * centsPerDollar;

  ok(Math.abs(res.cents / expected - 1) < 0.01, 'The price is found');

  deepEqual(
    Object.keys(store.known.rates).sort(),
    [chain.day_name(1), chain.day_name(2)],
    'The day before the quiet day is the starting day'
  );

  deepEqual(
    logs.filter(n => !!n.unsupported_starting_day),
    [{unsupported_starting_day: chain.day_name(3)}],
    'Stepping back is logged'
  );

  return;
});

test('A latest day without a price is stepped back from', async () => {
  // The latest complete day has no payments at all, nor the day after it
  const chain = makeChain({empty_days: [3, 4]});
  const logs = [];
  const store = makeStore({});

  const res = await method({
    date: chain.day(1),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    logger: {info: log => logs.push(log)},
    put_price: store.put_price,
  });

  const expected = chain.prices[chain.day_name(1)] * centsPerDollar;

  ok(Math.abs(res.cents / expected - 1) < 0.01, 'The price is found');

  deepEqual(
    logs.filter(n => !!n.unsupported_starting_day),
    [{unsupported_starting_day: chain.day_name(3)}],
    'The day without a price is stepped back from'
  );

  // Bridging through a day whose blocks give no price fails at that day
  await rejects(
    method({
      date: chain.day(3),
      get_prices: ({}, cbk) => cbk(null, {
        priors: {},
        rates: {[chain.day_name(1)]: store.known.rates[chain.day_name(1)]},
      }),
      height: chain.tip,
      lnd: chain.lnd,
      put_price: store.put_price,
    }),
    [503, 'FailedToFindSupportedPrice', {day: chain.day_name(3)}],
    'A day whose blocks give no price is not supported'
  );

  return;
});

test('A day far from known prices starts from the latest day', async () => {
  const chain = makeChain({});
  const store = makeStore({});

  // A price known long before the chain, at half of the prices on the chain
  store.known.rates['2025-10-20'] = {
    cents: chain.prices[chain.day_name(3)] * centsPerDollar / 2,
    version: methodVersion({}).version,
  };

  // Guided by the distant price, the start would be found at an alias of it
  const res = await method({
    date: chain.day(1),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  const expected = chain.prices[chain.day_name(1)] * centsPerDollar;

  ok(Math.abs(res.cents / expected - 1) < 0.01, 'The price is found');

  const [start] = store.puts;

  deepEqual(start.date, chain.day_name(3), 'The latest complete day starts');

  deepEqual(
    Object.keys(store.known.rates).sort(),
    ['2025-10-20', chain.day_name(1), chain.day_name(3)],
    'The day and the latest complete day have full prices'
  );

  deepEqual(
    Object.keys(store.known.priors),
    [chain.day_name(2)],
    'Only the day between them is bridged'
  );

  return;
});

test('A known price is bridged from unless over a week farther', async () => {
  const prices = [...Array(13).keys()].map(n => 60000 + n * 500);

  const chain = makeChain({prices, days: 12});

  const lookup = async n => {
    // The first day of the chain has a known price
    const store = makeStore({chain, known: [0]});

    const res = await method({
      date: chain.day(n),
      get_prices: store.get_prices,
      height: chain.tip,
      lnd: chain.lnd,
      put_price: store.put_price,
    });

    const expected = prices[n] * centsPerDollar;

    ok(Math.abs(res.cents / expected - 1) < 0.01, 'The price is found');

    return Object.keys(store.known.rates).sort();
  };

  // Nine days from the known price and two from the latest complete day
  deepEqual(
    await lookup(9),
    [chain.day_name(0), chain.day_name(9)],
    'The day is bridged to from the known price'
  );

  // Ten days from the known price and one from the latest complete day
  deepEqual(
    await lookup(10),
    [chain.day_name(0), chain.day_name(10), chain.day_name(11)],
    'The day is bridged to from the latest complete day'
  );

  return;
});
