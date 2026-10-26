const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const {makeStore} = require('./../fixtures');
const method = require('./../../chain/estimates/get_price_for_date');
const {methodVersion} = require('./../../chain/known');

const centsPerDollar = 100;

// Chains start well after the earliest supported day
const genesis = Date.parse('2026-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

test('An undetermined latest day leaves the day before to guide', async () => {
  // The latest complete day has no round payments, so no estimate supports it
  const chain = makeChain({quiet_days: [3]});

  // A known price two days before today is bridged from
  const store = makeStore({chain, known: [2]});

  const res = await method({
    date: chain.day(4),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  const expected = chain.prices[chain.day_name(4)] * centsPerDollar;

  deepEqual(res.is_provisional, true, 'Today is priced provisionally');
  ok(Math.abs(res.cents / expected - 1) < 0.01, 'The price is found');

  return;
});

test('A provisional day gets a full price once complete', async () => {
  const prices = [40123, 42345, 57890, 55555, 56789, 55000];

  // The fourth day is not complete at first, and is complete a day later
  const today = makeChain({prices});
  const later = makeChain({prices, days: 5});

  // The day before the fourth day is known
  const store = makeStore({chain: today, known: [3]});

  const lookup = chain => method({
    date: chain.day(4),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  const provisional = await lookup(today);

  deepEqual(provisional.is_provisional, true, 'The price is provisional');

  const complete = await lookup(later);

  deepEqual(complete.is_provisional, false, 'The price is final later');
  ok(!!store.known.rates[today.day_name(4)], 'The full day price is kept');

  const expected = today.prices[today.day_name(4)] * centsPerDollar;

  ok(Math.abs(complete.cents / expected - 1) < 0.01, 'The price is right');

  return;
});

test('An undetermined latest day is stepped back from for today', async () => {
  // The latest complete day has no round payments, so no estimate supports it
  const chain = makeChain({quiet_days: [3]});
  const store = makeStore({});

  // With nothing known, the start steps back from the latest complete day
  const res = await method({
    date: chain.day(4),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  const expected = chain.prices[chain.day_name(4)] * centsPerDollar;

  deepEqual(res.is_provisional, true, 'Today is priced from the start');
  ok(Math.abs(res.cents / expected - 1) < 0.01, 'The start is found');

  ok(!!store.known.rates[chain.day_name(2)], 'The day before is the start');

  return;
});

test('A provisional price left over does not skip a start', async () => {
  // A chain of ten complete days with a price known only on the first
  const prices = [...Array(11).keys()].map(n => 50000 + 300 * (n % 3));

  const chain = makeChain({prices, days: 10});

  const store = makeStore({chain, known: [0]});

  // An old provisional price of today survived from an earlier lookup
  store.known.provisional[chain.day_name(10)] = {
    blocks: [chain.tip - 400, chain.tip - 300],
    cents: prices[10] * centsPerDollar,
    version: methodVersion({}).version,
  };

  const res = await method({
    date: chain.day(10),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  deepEqual(res.is_provisional, true, 'Today is priced provisionally');
  deepEqual(Object.keys(store.known.priors), [], 'No days are bridged');

  ok(!!store.known.rates[chain.day_name(9)], 'It starts from the latest day');

  return;
});
