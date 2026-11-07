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

// A price is near a price in dollars
const isNear = (cents, usd) => abs(cents / (usd * centsPerDollar) - 1) < 0.01;

// Arguments to look up the price of a day of a chain with a store of prices
const makeArgs = ({chain, day, store}) => ({
  date: chain.day(day),
  get_prices: store.get_prices,
  height: chain.tip,
  lnd: chain.lnd,
  put_price: store.put_price,
});

// LND for a chain that is not expected to be asked for any blocks
const unusedBlocksLnd = chain => ({
  blocks: Object.assign({}, chain.lnd.blocks, {
    getBlock: () => {
      throw new Error('UnexpectedFetchOfBlock');
    },
  }),
  chain: chain.lnd.chain,
});

// The chain tip is one hour into the final day
const early = makeChain({tip_hours: 1});
const earlyStore = makeStore({chain: early, known: [2]});

// Only the price of the day three days before the final day is known
const midday = makeChain({});
const middayStore = makeStore({chain: midday, known: [1]});

// Half an hour after midnight the day before is not complete yet
const midnight = makeChain({tip_hours: 0.5});
const midnightStore = makeStore({chain: midnight, known: [1]});

// A chain whose days are after the clock, so the chain tip sets the day
const ahead = makeChain({genesis: Date.parse('2100-01-01') / 1000});

// A chain whose tip is far behind the clock, like a node that is syncing
const behind = makeChain({});

// A provisional price of today whose blocks were lost to a damaged file
const damaged = makeChain({});
const damagedStore = makeStore({chain: damaged, known: [3]});

damagedStore.known.provisional[damaged.day_name(4)] = {
  version,
  blocks: 'blocks',
  cents: 1000000,
};

// A provisional price of today derived at nearly the chain tip
const recent = makeChain({});
const recentStore = makeStore({chain: recent, known: [3]});

recentStore.known.provisional[recent.day_name(4)] = {
  version,
  blocks: [recent.tip - 30, recent.tip - 6],
  cents: 1234567,
};

// A provisional price whose last block is twenty blocks below the tip
const stale = makeChain({});
const staleStore = makeStore({chain: stale, known: [3]});

staleStore.known.provisional[stale.day_name(4)] = {
  version,
  blocks: [stale.tip - 40, stale.tip - 20],
  cents: 1,
};

// The final, incomplete day has no payments at all, or no round payments
const empty = makeChain({empty_days: [4]});
const quiet = makeChain({quiet_days: [4]});

// The latest complete day is known at double its true price
const aliased = makeChain({});
const aliasedStore = makeStore({});

aliasedStore.known.rates[aliased.day_name(3)] = {
  version,
  blocks: [437, 580],
  cents: aliased.prices[aliased.day_name(3)] * centsPerDollar * 2,
};

const tests = [
  {
    args: makeArgs({chain: early, day: 4, store: earlyStore}),
    description: 'A provisional price early in a day uses earlier blocks',
    expected: {
      is_at_price_before: true,
      is_confirmed_only: true,
      is_provisional: true,
      padded_blocks: 36,
    },
    measure: res => {
      const {blocks} = earlyStore.puts.find(n => !!n.is_provisional);

      // The blocks before the day were at the price of the day before
      const before = early.prices[early.day_name(3)];

      return {
        is_at_price_before: isNear(res.cents, before),
        is_confirmed_only: blocks[1] <= early.tip - 6,
        is_provisional: res.is_provisional,
        padded_blocks: blocks[1] - blocks[0] + 1,
      };
    },
  },
  {
    args: makeArgs({chain: midday, day: 4, store: middayStore}),
    description: 'A provisional price is guided by the latest complete day',
    expected: {
      is_provisional: true,
      priors: [midday.day_name(2), midday.day_name(3)],
    },
    measure: res => ({
      is_provisional: res.is_provisional,
      priors: Object.keys(middayStore.known.priors).sort(),
    }),
  },
  {
    args: makeArgs({chain: midnight, day: 4, store: midnightStore}),
    description: 'An incomplete day before is not bridged to',
    expected: {is_provisional: true, priors: [midnight.day_name(2)]},
    measure: res => ({
      is_provisional: res.is_provisional,
      priors: Object.keys(midnightStore.known.priors).sort(),
    }),
  },
  {
    args: Object.assign(
      makeArgs({chain: ahead, day: 5, store: makeStore({})}),
      {lnd: unusedBlocksLnd(ahead)}
    ),
    description: 'A day that has not started yet is an error',
    error: [
      400,
      'DateAfterCurrentDayToGetPriceForDate',
      {day: ahead.day_name(5)},
    ],
  },
  {
    args: makeArgs({
      chain: ahead,
      day: 4,
      store: makeStore({chain: ahead, known: [3]}),
    }),
    description: 'The day of the chain tip is provisional',
    expected: {is_provisional: true},
    measure: res => ({is_provisional: res.is_provisional}),
  },
  {
    args: Object.assign(
      makeArgs({chain: behind, day: 6, store: makeStore({})}),
      {lnd: unusedBlocksLnd(behind)}
    ),
    description: 'A day the chain has not reached is an error',
    error: [
      503,
      'ChainHasNotReachedDayToGetPriceForDate',
      {day: behind.day_name(6)},
    ],
  },
  {
    args: makeArgs({
      chain: behind,
      day: 5,
      store: makeStore({chain: behind, known: [3]}),
    }),
    description: 'A day starting a few hours after the chain tip is priced',
    expected: {is_provisional: true},
    measure: res => ({is_provisional: res.is_provisional}),
  },
  {
    args: makeArgs({chain: damaged, day: 4, store: damagedStore}),
    description: 'A provisional price with damaged blocks is not reused',
    expected: {is_derived_again: true},
    measure: res => ({
      is_derived_again: isNear(res.cents, damaged.prices[damaged.day_name(4)]),
    }),
  },
  {
    args: Object.assign(
      makeArgs({chain: recent, day: 4, store: recentStore}),
      {lnd: unusedBlocksLnd(recent)}
    ),
    description: 'A recent provisional price is reused',
    expected: {cents: 1234567, is_provisional: true},
    measure: res => res,
  },
  {
    args: makeArgs({chain: stale, day: 4, store: staleStore}),
    description: 'An old provisional price is derived again',
    expected: {is_derived_again: true, is_provisional: true},
    measure: res => ({
      is_derived_again: isNear(res.cents, stale.prices[stale.day_name(4)]),
      is_provisional: res.is_provisional,
    }),
  },
  {
    args: makeArgs({
      chain: empty,
      day: 4,
      store: makeStore({chain: empty, known: [3]}),
    }),
    description: 'A provisional price from no payments is an error',
    error: [
      503,
      'FailedToFindSupportedProvisionalPrice',
      {day: empty.day_name(4)},
    ],
  },
  {
    args: makeArgs({
      chain: quiet,
      day: 4,
      store: makeStore({chain: quiet, known: [3]}),
    }),
    description: 'A provisional price that cannot be supported is an error',
    error: [
      503,
      'FailedToFindSupportedProvisionalPrice',
      {day: quiet.day_name(4)},
    ],
  },
  {
    args: makeArgs({chain: aliased, day: 4, store: aliasedStore}),
    description: 'A provisional price at an alias of its guide conflicts',
    error: err => err[1] === 'FoundProvisionalPriceAtAliasOfGuidePrice',
  },
];

tests.forEach(({args, description, error, expected, measure}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(measure(await method(args)), expected, 'Got expected price');
    }

    return;
  });
});
