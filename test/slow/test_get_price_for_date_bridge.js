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

test('A day whose price cannot be supported is an error', async () => {
  // The second day has no round payments at all
  const chain = makeChain({quiet_days: [2]});

  const store = makeStore({chain, known: [3]});

  const lookup = date => method({
    date,
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  await rejects(
    lookup(chain.day(2)),
    [503, 'FailedToFindSupportedPrice', {day: chain.day_name(2)}],
    'The quiet day itself cannot be priced'
  );

  deepEqual(
    Object.keys(store.known.rates),
    [chain.day_name(3)],
    'Nothing more is remembered'
  );

  await rejects(
    lookup(chain.day(0)),
    [503, 'FailedToFindSupportedPriceToBridgeDay', {day: chain.day_name(2)}],
    'The quiet day cannot be bridged over'
  );

  deepEqual(store.known.priors, {}, 'No unsupported estimate is remembered');

  return;
});

test('A day that cannot be supported is not estimated again', async () => {
  // The second day has no round payments at all
  const chain = makeChain({quiet_days: [2]});

  const store = makeStore({chain, known: [3]});

  const unsupported = new Map();

  const lookup = date => method({
    date,
    unsupported,
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  const error = [503, 'FailedToFindSupportedPriceToBridgeDay', {
    day: chain.day_name(2),
  }];

  await rejects(lookup(chain.day(0)), error, 'The quiet day is bridged over');

  deepEqual(unsupported.size, 1, 'The unsupported estimate is kept');

  const fetched = chain.calls.blocks;

  await rejects(lookup(chain.day(0)), error, 'The date fails again');
  await rejects(lookup(chain.day(1)), error, 'Another date fails at the day');

  deepEqual(chain.calls.blocks, fetched, 'No blocks are fetched again');

  return;
});

test('An unsupported day is estimated again when its blocks go', async () => {
  // The second day has no round payments at all
  const quiet = makeChain({quiet_days: [2]});

  const unsupported = new Map();

  const lookup = ({chain, height}) => {
    const store = makeStore({chain, known: [3]});

    return method({
      unsupported,
      date: chain.day(0),
      get_prices: store.get_prices,
      height: height || chain.tip,
      lnd: chain.lnd,
      put_price: store.put_price,
    });
  };

  await rejects(
    lookup({chain: quiet}),
    [503, 'FailedToFindSupportedPriceToBridgeDay', {day: quiet.day_name(2)}],
    'The quiet day cannot be bridged over'
  );

  const [[key, estimate]] = unsupported;

  const [, last] = estimate.blocks;

  // A chain tip below the last block of the day leaves the day incomplete
  await rejects(
    lookup({chain: quiet, height: last - 1}),
    [503, 'ExpectedCompleteDayToEstimateDayPrice'],
    'The day is estimated again and is not complete'
  );

  deepEqual(unsupported.size, 0, 'The estimate past the tip is dropped');

  // The estimate is kept again, as when the chain grew back past the day
  unsupported.set(key, estimate);

  // A reorganization replaces the last block of the day, and the new chain
  // has round payments on every day
  const reorged = makeChain({time_shifts: {[last]: 1}});

  const {cents} = await lookup({chain: reorged});

  const expected = reorged.prices[reorged.day_name(0)] * centsPerDollar;

  ok(Math.abs(cents / expected - 1) < 0.01, 'The price is found');

  deepEqual(unsupported.size, 0, 'The estimate of replaced blocks is dropped');

  return;
});

test('A price outside the expected window is found by widening', async () => {
  // The price jumps by more than the daily window between the first two days
  const chain = makeChain({prices: [40007, 40007, 65003, 65003, 65003]});

  const store = makeStore({chain, known: [2]});

  const isClose = (cents, day) => {
    return Math.abs(cents / centsPerDollar / chain.prices[day] - 1) < 0.01;
  };

  const first = await method({
    date: chain.day(0),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  ok(isClose(first.cents, chain.day_name(0)), 'Price found across the jump');

  const jump = store.puts.find(n => n.date === chain.day_name(1));

  deepEqual(jump.is_widened, true, 'The jump day search was widened');
  ok(isClose(jump.cents, chain.day_name(1)), 'The jump day price is found');

  return;
});

test('A jump that the data cannot support stops a bridge', async () => {
  // Too few payments support no price after the jump, even when widened
  const chain = makeChain({
    payments_per_block: 1,
    prices: [40007, 40007, 65003, 65003, 65003],
  });

  const store = makeStore({chain, known: [2]});

  await rejects(
    method({
      date: chain.day(0),
      get_prices: store.get_prices,
      height: chain.tip,
      lnd: chain.lnd,
      put_price: store.put_price,
    }),
    [503, 'FailedToFindSupportedPriceToBridgeDay', {day: chain.day_name(1)}],
    'The day of the jump cannot be bridged over'
  );

  return;
});

test('Days the price jumped in are bridged through by windows', async () => {
  // The price jumps by eight percent at 11:00 every day
  const hourlyMoves = [...Array(24).keys()].map(hour => hour < 11 ? 0 : 0.08);

  const chain = makeChain({
    hourly_moves: hourlyMoves,
    prices: Array(5).fill(60000),
  });

  const store = makeStore({});

  // The latest complete day is known at its time weighted median price
  store.known.rates[chain.day_name(3)] = {
    cents: 6480000,
    version: methodVersion({}).version,
  };

  const res = await method({
    date: chain.day(0),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  });

  // A day spends more of its time after the jump than before it
  ok(Math.abs(res.cents / 6480000 - 1) < 0.005, 'Price is the time median');

  deepEqual(
    Object.keys(store.known.rates).sort(),
    [chain.day_name(0), chain.day_name(3)],
    'The date and the known day have full prices'
  );

  deepEqual(
    Object.keys(store.known.priors).sort(),
    [chain.day_name(1), chain.day_name(2)],
    'The days in between are bridged'
  );

  const windowed = store.puts.filter(n => n.windows >= 10);

  ok(!!windowed.length, 'Days that are not supported whole use windows');

  store.puts.forEach(({cents}) => {
    ok(Math.abs(cents / 6480000 - 1) < 0.005, 'Each day is priced the same');

    return;
  });

  return;
});

test('A price at an alias of the neighboring day is a conflict', async () => {
  const chain = makeChain({});
  const store = makeStore({});

  // The latest complete day is known at double its true price
  const wrong = chain.prices[chain.day_name(3)] * centsPerDollar * 2;

  store.known.rates[chain.day_name(3)] = {
    blocks: [437, 580],
    cents: wrong,
    version: methodVersion({}).version,
  };

  await rejects(
    method({
      date: chain.day(2),
      get_prices: store.get_prices,
      height: chain.tip,
      lnd: chain.lnd,
      put_price: store.put_price,
    }),
    err => {
      const [code, message, details] = err;

      deepEqual(code, 503, 'Error code');
      deepEqual(message, 'FoundPriceAtAliasOfNeighboringDayPrice', 'Message');
      deepEqual(details.day, chain.day_name(2), 'Day is named');
      deepEqual(details.neighbor, chain.day_name(3), 'Neighbor is named');
      deepEqual(details.neighbor_cents, wrong, 'Neighbor price is given');

      const truth = chain.prices[chain.day_name(2)] * centsPerDollar;

      ok(Math.abs(details.cents / truth - 1) < 0.01, 'Found price is given');

      return true;
    },
    'The conflict between the two days is an error'
  );

  deepEqual(store.puts, [], 'Nothing is remembered');

  return;
});
