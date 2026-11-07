const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const {makeStore} = require('./../fixtures');
const method = require('./../../chain/estimates/get_price_for_date');
const {methodVersion} = require('./../../chain/known');

const {abs} = Math;
const centsPerDollar = 100;
const {version} = methodVersion({});

// Chains start well after the earliest supported day
const genesis = Date.parse('2026-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

// A price is near the price of a day of a chain
const isClose = ({cents, chain, day}) => {
  return abs(cents / centsPerDollar / chain.prices[day] - 1) < 0.01;
};

// Get the outcome of a lookup, as an error or as a price
const outcomeOf = promise => promise.then(res => res, err => ({err}));

// Arguments to look up the price of a day of a chain with a store of prices
const makeArgs = ({chain, day, store}) => ({
  date: chain.day(day),
  get_prices: store.get_prices,
  height: chain.tip,
  lnd: chain.lnd,
  put_price: store.put_price,
});

// Remembering a price is not expected
const unexpectedPut = () => {
  throw new Error('UnexpectedPriceRemembered');
};

// The second day has no round payments at all
const quiet = makeChain({quiet_days: [2]});

// Arguments to look up a day of the quiet chain, without remembering a price
const quietArgs = day => Object.assign(
  makeArgs({day, chain: quiet, store: makeStore({chain: quiet, known: [3]})}),
  {put_price: unexpectedPut}
);

// The price jumps by more than the daily window between the first two days
const jumps = [40007, 40007, 65003, 65003, 65003];

const jumped = makeChain({prices: jumps});
const jumpedStore = makeStore({chain: jumped, known: [2]});

// Too few payments support no price after the jump, even when widened
const sparse = makeChain({payments_per_block: 1, prices: jumps});

// The price jumps by eight percent at 11:00 every day
const hourlyMoves = [...Array(24).keys()].map(hour => hour < 11 ? 0 : 0.08);

const jumpy = makeChain({
  hourly_moves: hourlyMoves,
  prices: Array(5).fill(60000),
});

const jumpyStore = makeStore({});

// The latest complete day is known at its time weighted median price
jumpyStore.known.rates[jumpy.day_name(3)] = {version, cents: 6480000};

// The latest complete day is known at double its true price
const aliased = makeChain({});
const aliasedStore = makeStore({});
const wrong = aliased.prices[aliased.day_name(3)] * centsPerDollar * 2;

aliasedStore.known.rates[aliased.day_name(3)] = {
  version,
  blocks: [437, 580],
  cents: wrong,
};

const tests = [
  {
    args: quietArgs(2),
    description: 'A day whose price cannot be supported is an error',
    error: [503, 'FailedToFindSupportedPrice', {day: quiet.day_name(2)}],
  },
  {
    args: quietArgs(0),
    description: 'A day whose price cannot be supported is not bridged over',
    error: [
      503,
      'FailedToFindSupportedPriceToBridgeDay',
      {day: quiet.day_name(2)},
    ],
  },
  {
    args: {chain: makeChain({quiet_days: [2]})},
    description: 'A day that cannot be supported is not estimated again',
    expected: {
      errors: Array(3).fill([
        503,
        'FailedToFindSupportedPriceToBridgeDay',
        {day: quiet.day_name(2)},
      ]),
      fetched_again: 0,
      kept: 1,
    },
    scenario: async ({chain}) => {
      const store = makeStore({chain, known: [3]});
      const unsupported = new Map();

      const lookup = day => outcomeOf(method(Object.assign(
        makeArgs({chain, day, store}),
        {unsupported}
      )));

      const first = await lookup(0);

      const fetched = chain.calls.blocks;
      const kept = unsupported.size;

      const again = await lookup(0);
      const another = await lookup(1);

      return {
        kept,
        errors: [first.err, again.err, another.err],
        fetched_again: chain.calls.blocks - fetched,
      };
    },
  },
  {
    args: {},
    description: 'An unsupported day is estimated again when its blocks go',
    expected: {
      errors: [
        [
          503,
          'FailedToFindSupportedPriceToBridgeDay',
          {day: quiet.day_name(2)},
        ],
        [503, 'ExpectedCompleteDayToEstimateDayPrice'],
      ],
      is_found: true,
      kept_past_tip: 0,
      kept_replaced: 0,
    },
    scenario: async () => {
      const chain = makeChain({quiet_days: [2]});
      const unsupported = new Map();

      const lookup = ({height, onChain}) => {
        const store = makeStore({chain: onChain, known: [3]});

        return outcomeOf(method({
          unsupported,
          date: onChain.day(0),
          get_prices: store.get_prices,
          height: height || onChain.tip,
          lnd: onChain.lnd,
          put_price: store.put_price,
        }));
      };

      const first = await lookup({onChain: chain});

      const [[key, estimate]] = unsupported;

      const [, last] = estimate.blocks;

      // A chain tip below the last block of the day leaves it incomplete
      const incomplete = await lookup({height: last - 1, onChain: chain});

      const keptPastTip = unsupported.size;

      // The estimate is kept again, as when the chain grew back past the day
      unsupported.set(key, estimate);

      // A reorganization replaces the last block of the day, and the new
      // chain has round payments on every day
      const reorged = makeChain({time_shifts: {[last]: 1}});

      const {cents} = await lookup({onChain: reorged});

      return {
        errors: [first.err, incomplete.err],
        is_found: isClose({cents, chain: reorged, day: reorged.day_name(0)}),
        kept_past_tip: keptPastTip,
        kept_replaced: unsupported.size,
      };
    },
  },
  {
    args: makeArgs({chain: jumped, day: 0, store: jumpedStore}),
    description: 'A price outside the expected window is found by widening',
    expected: {is_found: true, is_jump_found: true, is_jump_widened: true},
    scenario: async args => {
      const {cents} = await method(args);

      const day = jumped.day_name(1);

      const jump = jumpedStore.puts.find(n => n.date === day);

      return {
        is_found: isClose({cents, chain: jumped, day: jumped.day_name(0)}),
        is_jump_found: isClose({day, cents: jump.cents, chain: jumped}),
        is_jump_widened: jump.is_widened,
      };
    },
  },
  {
    args: makeArgs({
      chain: sparse,
      day: 0,
      store: makeStore({chain: sparse, known: [2]}),
    }),
    description: 'A jump that the data cannot support stops a bridge',
    error: [
      503,
      'FailedToFindSupportedPriceToBridgeDay',
      {day: sparse.day_name(1)},
    ],
  },
  {
    args: makeArgs({chain: jumpy, day: 0, store: jumpyStore}),
    description: 'Days the price jumped in are bridged through by windows',
    expected: {
      is_each_same: true,
      is_time_median: true,
      is_windowed: true,
      priors: [jumpy.day_name(1), jumpy.day_name(2)],
      rates: [jumpy.day_name(0), jumpy.day_name(3)],
    },
    scenario: async args => {
      const {cents} = await method(args);

      // A day spends more of its time after the jump than before it
      const isTimeMedian = n => abs(n / 6480000 - 1) < 0.005;

      return {
        is_each_same: jumpyStore.puts.every(n => isTimeMedian(n.cents)),
        is_time_median: isTimeMedian(cents),

        // Days that are not supported whole use windows
        is_windowed: jumpyStore.puts.some(n => n.windows >= 10),
        priors: Object.keys(jumpyStore.known.priors).sort(),
        rates: Object.keys(jumpyStore.known.rates).sort(),
      };
    },
  },
  {
    args: Object.assign(
      makeArgs({chain: aliased, day: 2, store: aliasedStore}),
      {put_price: unexpectedPut}
    ),
    description: 'A price at an alias of the neighboring day is a conflict',
    error: ([code, message, details]) => {
      const truth = aliased.prices[aliased.day_name(2)] * centsPerDollar;

      return code === 503 &&
        message === 'FoundPriceAtAliasOfNeighboringDayPrice' &&
        details.day === aliased.day_name(2) &&
        details.neighbor === aliased.day_name(3) &&
        details.neighbor_cents === wrong &&
        abs(details.cents / truth - 1) < 0.01;
    },
  },
];

tests.forEach(({args, description, error, expected, scenario}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await scenario(args), expected, 'Got expected result');
    }

    return;
  });
});
