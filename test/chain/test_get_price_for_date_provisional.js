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

test('A provisional price early in a day uses earlier blocks', async () => {
  // The chain tip is one hour into the final day
  const chain = makeChain({tip_hours: 1});

  const store = makeStore({chain, known: [2]});

  const res = await method({
    date: chain.day(4),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  deepEqual(res.is_provisional, true, 'The price is provisional');

  const provisional = store.puts.find(n => !!n.is_provisional);

  deepEqual(provisional.blocks[1] - provisional.blocks[0] + 1, 36, 'Padded');
  ok(provisional.blocks[1] <= chain.tip - 6, 'Only confirmed blocks are used');

  // The blocks before the day were at the price of the day before
  const before = chain.prices[chain.day_name(3)] * centsPerDollar;

  ok(Math.abs(res.cents / before - 1) < 0.01, 'Price reflects blocks used');

  return;
});

test('A provisional price is guided by the latest complete day', async () => {
  const lookup = async ({chain}) => {
    // Only the price of the day three days before the final day is known
    const store = makeStore({chain, known: [1]});

    const res = await method({
      date: chain.day(4),
      get_prices: store.get_prices,
      height: chain.tip,
      lnd: chain.lnd,
      put_price: store.put_price,
    });

    return {res, priors: Object.keys(store.known.priors).sort()};
  };

  const midday = makeChain({});

  const today = await lookup({chain: midday});

  deepEqual(today.res.is_provisional, true, 'The price is provisional');

  deepEqual(
    today.priors,
    [midday.day_name(2), midday.day_name(3)],
    'The days up to the day before are bridged'
  );

  // Half an hour after midnight the day before is not complete yet
  const midnight = makeChain({tip_hours: 0.5});

  const early = await lookup({chain: midnight});

  deepEqual(early.res.is_provisional, true, 'Early in the day is provisional');

  deepEqual(
    early.priors,
    [midnight.day_name(2)],
    'An incomplete day before is not bridged to'
  );

  return;
});

test('A day that has not started yet is an error', async () => {
  // A chain whose days are after the clock, so the chain tip sets the day
  const chain = makeChain({genesis: Date.parse('2100-01-01') / 1000});

  const store = makeStore({chain, known: [3]});

  const lookup = n => method({
    date: chain.day(n),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  await rejects(
    lookup(5),
    [400, 'DateAfterCurrentDayToGetPriceForDate', {day: chain.day_name(5)}],
    'The day after the chain tip has no price'
  );

  deepEqual(chain.calls.blocks, 0, 'No blocks are fetched');

  const today = await lookup(4);

  deepEqual(today.is_provisional, true, 'The day of the tip is provisional');

  return;
});

test('A day the chain has not reached is an error', async () => {
  // A chain whose tip is far behind the clock, like a node that is syncing
  const chain = makeChain({});

  const store = makeStore({chain, known: [3]});

  const lookup = n => method({
    date: chain.day(n),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  await rejects(
    lookup(6),
    [503, 'ChainHasNotReachedDayToGetPriceForDate', {day: chain.day_name(6)}],
    'A day long after the chain tip has no price'
  );

  deepEqual(chain.calls.blocks, 0, 'No blocks are fetched');

  // The next day starts a few hours after the time of the chain tip
  const next = await lookup(5);

  deepEqual(next.is_provisional, true, 'A day just after the tip is priced');

  return;
});

test('A provisional price with damaged blocks is not reused', async () => {
  const chain = makeChain({});

  const store = makeStore({chain, known: [3]});

  // A provisional price of today whose blocks were lost to a damaged file
  store.known.provisional[chain.day_name(4)] = {
    blocks: 'blocks',
    cents: 1000000,
    version: methodVersion({}).version,
  };

  const res = await method({
    date: chain.day(4),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  const expected = chain.prices[chain.day_name(4)] * centsPerDollar;

  ok(Math.abs(res.cents / expected - 1) < 0.01, 'The price is derived again');

  return;
});

test('A recent provisional price is reused, an old one is not', async () => {
  const chain = makeChain({});

  const store = makeStore({chain, known: [3]});

  const lookup = () => method({
    date: chain.day(4),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  const first = await lookup();

  deepEqual(first.is_provisional, true, 'The price is provisional');

  const fetched = chain.calls.blocks;

  deepEqual(await lookup(), first, 'A recent provisional price is reused');
  deepEqual(chain.calls.blocks, fetched, 'No blocks are fetched again');

  // A provisional price whose last block is twenty blocks below the tip
  store.known.provisional[chain.day_name(4)] = {
    blocks: [chain.tip - 40, chain.tip - 20],
    cents: 1,
    version: methodVersion({}).version,
  };

  const again = await lookup();

  deepEqual(again, first, 'An old provisional price is derived again');
  ok(chain.calls.blocks > fetched, 'The blocks are fetched again');

  return;
});

test('A provisional price from no payments is an error', async () => {
  // The final, incomplete day has no payments at all
  const chain = makeChain({empty_days: [4]});

  const store = makeStore({chain, known: [3]});

  await rejects(
    method({
      date: chain.day(4),
      get_prices: store.get_prices,
      height: chain.tip,
      lnd: chain.lnd,
      put_price: store.put_price,
    }),
    [503, 'FailedToFindSupportedProvisionalPrice', {day: chain.day_name(4)}],
    'The provisional price is not supported'
  );

  return;
});

test('A provisional price that cannot be supported is an error', async () => {
  // The final, incomplete day has no round payments
  const chain = makeChain({quiet_days: [4]});

  const store = makeStore({chain, known: [3]});

  await rejects(
    method({
      date: chain.day(4),
      get_prices: store.get_prices,
      height: chain.tip,
      lnd: chain.lnd,
      put_price: store.put_price,
    }),
    [503, 'FailedToFindSupportedProvisionalPrice', {day: chain.day_name(4)}],
    'The provisional price is not supported'
  );

  return;
});

test('A provisional price at an alias of its guide conflicts', async () => {
  const chain = makeChain({});
  const store = makeStore({});

  // The latest complete day is known at double its true price
  store.known.rates[chain.day_name(3)] = {
    blocks: [437, 580],
    cents: chain.prices[chain.day_name(3)] * centsPerDollar * 2,
    version: methodVersion({}).version,
  };

  await rejects(
    method({
      date: chain.day(4),
      get_prices: store.get_prices,
      height: chain.tip,
      lnd: chain.lnd,
      put_price: store.put_price,
    }),
    err => err[1] === 'FoundProvisionalPriceAtAliasOfGuidePrice',
    'The provisional price conflicts with the guide'
  );

  return;
});
