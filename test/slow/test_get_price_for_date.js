const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const {makeStore} = require('./../fixtures');
const method = require('./../../chain/estimates/get_price_for_date');

const centsPerDollar = 100;

// Chains start well after the earliest supported day
const genesis = Date.parse('2026-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

test('Errors remembering prices are passed back', async () => {
  const chain = makeChain({});
  const store = makeStore({});

  await rejects(
    method({
      date: chain.day(1),
      get_prices: store.get_prices,
      height: chain.tip,
      lnd: chain.lnd,
      put_price: ({}, cbk) => cbk([503, 'PutPriceErr']),
    }),
    [503, 'PutPriceErr'],
    'Got expected error'
  );

  return;
});

test('Prices are derived from chain data', async () => {
  const chain = makeChain({});
  const store = makeStore({});

  const isClose = (cents, day) => {
    return Math.abs(cents / centsPerDollar / chain.prices[day] - 1) < 0.01;
  };

  const lookup = date => method({
    date,
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  // Looking up the first day requires starting from the latest complete day
  const first = await lookup(chain.day(0));

  ok(isClose(first.cents, chain.day_name(0)), 'Price found');
  deepEqual(first.is_provisional, false, 'Price is final');

  deepEqual(
    Object.keys(store.known.rates).sort(),
    [chain.day_name(0), chain.day_name(3)],
    'The first day and the latest complete day have full prices'
  );

  deepEqual(
    Object.keys(store.known.priors).sort(),
    [chain.day_name(1), chain.day_name(2)],
    'The days in between have quick estimates'
  );

  const latest = store.known.rates[chain.day_name(3)];

  ok(isClose(latest.cents, chain.day_name(3)), 'Latest day price found');

  const [coldStart] = store.puts;

  deepEqual(coldStart.date, chain.day_name(3), 'Cold start is latest day');
  deepEqual(coldStart.is_sample, undefined, 'Cold start is a full day price');
  ok(coldStart.blocks[1] > coldStart.blocks[0], 'Block range is recorded');
  ok(coldStart.confidence > 1, 'Confidence is recorded');
  ok(coldStart.outputs > 0, 'Outputs count is recorded');
  ok(coldStart.spikes.find(n => n.usd === 100).strength === 1, 'Spikes');

  const samples = store.puts.filter(n => !!n.is_sample);

  deepEqual(samples.length, 2, 'Bridging estimates are reported as samples');

  // Looking up a bridged day derives a full price for it
  const second = await lookup(chain.day(2));

  ok(isClose(second.cents, chain.day_name(2)), 'Price found');

  deepEqual(
    Object.keys(store.known.priors),
    [chain.day_name(1)],
    'The full price replaces the quick estimate'
  );

  // Looking up the incomplete final day gives a provisional price
  const today = await lookup(chain.day(4));

  ok(isClose(today.cents, chain.day_name(4)), 'Price found');
  deepEqual(today.is_provisional, true, 'Price is provisional');

  const provisional = store.puts.find(n => !!n.is_provisional);

  deepEqual(provisional.date, chain.day_name(4), 'Provisional price reported');

  // Looking up again returns the known prices without fetching blocks
  const fetched = chain.calls.blocks;

  deepEqual(await lookup(chain.day(0)), first, 'Known price is returned');
  deepEqual(await lookup(chain.day(4)), today, 'Provisional price returned');
  deepEqual(chain.calls.blocks, fetched, 'No blocks are fetched');

  return;
});

test('A date with an offset is priced on its day in UTC', async () => {
  const chain = makeChain({});

  const store = makeStore({chain, known: [0]});

  // The evening of the first day in California is the second day in UTC
  const res = await method({
    date: `${chain.day_name(0)}T20:00:00-07:00`,
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  const expected = chain.prices[chain.day_name(1)] * centsPerDollar;

  ok(Math.abs(res.cents / expected - 1) < 0.01, 'The UTC day is priced');

  deepEqual(
    Object.keys(store.known.rates).sort(),
    [chain.day_name(0), chain.day_name(1)],
    'The UTC day has a full price'
  );

  return;
});

test('A price from replaced blocks is reported for removal', async () => {
  const chain = makeChain({});

  const store = makeStore({chain, known: [2]});

  const removals = [];

  const day = chain.day_name(3);
  const replaced = 'ff'.repeat(32);

  const lookup = remove => method({
    date: chain.day(3),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
    remove_prices: remove || (({removed}, cbk) => {
      removals.push(removed);

      return cbk();
    }),
  });

  const first = await lookup();

  deepEqual(removals, [], 'Nothing is removed while the blocks are there');

  // The last block of the known price is replaced in a reorganization
  store.known.rates[day].hash = replaced;

  const fetched = chain.calls.blocks;

  const again = await lookup();

  deepEqual(removals, [[{day, hash: replaced}]], 'The price is reported');
  deepEqual(again, first, 'The price is derived again');
  ok(chain.calls.blocks > fetched, 'The blocks are fetched again');
  ok(store.known.rates[day].hash !== replaced, 'The new price is remembered');

  store.known.rates[day].hash = replaced;

  await rejects(
    lookup(({}, cbk) => cbk([503, 'RemovePricesErr'])),
    [503, 'RemovePricesErr'],
    'Errors removing prices are passed back'
  );

  return;
});
