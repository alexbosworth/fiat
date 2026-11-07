const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const {makeStore} = require('./../fixtures');
const method = require('./../../chain/estimates/get_price_for_date');
const {methodVersion} = require('./../../chain/known');

const {abs} = Math;
const centsPerDollar = 100;
const replaced = 'ff'.repeat(32);
const {version} = methodVersion({});

// Chains start well after the earliest supported day
const genesis = Date.parse('2026-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

// A price is near the price of a day of a chain
const isClose = ({cents, chain, day}) => {
  return abs(cents / centsPerDollar / chain.prices[day] - 1) < 0.01;
};

// Arguments to look up the price of a day of a chain with a store of prices
const makeArgs = ({chain, date, store}) => ({
  date,
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

// A chain and a store that starts out knowing nothing
const fresh = makeChain({});
const freshStore = makeStore({});

// A store with the full price of a day around quick estimates of its days
const bridged = makeChain({});
const bridgedStore = makeStore({chain: bridged, known: [0, 3]});

[1, 2].forEach(n => {
  bridgedStore.known.priors[bridged.day_name(n)] = {
    version,
    cents: bridged.prices[bridged.day_name(n)] * centsPerDollar,
  };
});

// A store with the price of the latest complete day
const latest = makeChain({});
const latestStore = makeStore({chain: latest, known: [3]});

// A store with prices it knows for a day and a recent provisional price
const known = makeChain({});
const knownStore = makeStore({chain: known, known: [0]});

knownStore.known.provisional[known.day_name(4)] = {
  version,
  blocks: [known.tip - 30, known.tip - 6],
  cents: 1234567,
};

// A store with a price of a day whose last block was replaced
const reorged = makeChain({});

const makeReorgedStore = () => {
  const store = makeStore({chain: reorged, known: [2]});

  store.known.rates[reorged.day_name(3)] = {
    version,
    block_id: replaced,
    blocks: [437, 580],
    cents: reorged.prices[reorged.day_name(3)] * centsPerDollar,
  };

  return store;
};

const reorgedStore = makeReorgedStore();

// Removals that are reported, and a function that records them
const removals = [];

const recordRemovals = ({removed}, cbk) => {
  removals.push(removed);

  return cbk();
};

const tests = [
  {
    args: Object.assign(makeArgs({
      chain: fresh,
      date: fresh.day(1),
      store: makeStore({}),
    }),
    {put_price: ({}, cbk) => cbk([503, 'PutPriceErr'])}),
    description: 'Errors remembering prices are passed back',
    error: [503, 'PutPriceErr'],
  },
  {
    args: makeArgs({chain: fresh, date: fresh.day(0), store: freshStore}),
    description: 'Looking up a first day starts from the latest complete day',
    expected: {
      cold_start: fresh.day_name(3),
      is_cold_start_full: true,
      is_found: true,
      is_latest_found: true,
      is_provisional: false,
      priors: [fresh.day_name(1), fresh.day_name(2)],
      rates: [fresh.day_name(0), fresh.day_name(3)],
      samples: 2,
    },
    measure: res => {
      const [coldStart] = freshStore.puts;

      const {cents} = freshStore.known.rates[fresh.day_name(3)];

      // The cold start is a full day price with all of its details
      const isFull = coldStart.is_sample === undefined &&
        coldStart.blocks[1] > coldStart.blocks[0] &&
        coldStart.confidence > 1 &&
        coldStart.outputs > 0 &&
        coldStart.spikes.find(n => n.usd === 100).strength === 1;

      const first = fresh.day_name(0);
      const last = fresh.day_name(3);

      return {
        cold_start: coldStart.date,
        is_cold_start_full: isFull,
        is_found: isClose({chain: fresh, cents: res.cents, day: first}),
        is_latest_found: isClose({cents, chain: fresh, day: last}),
        is_provisional: res.is_provisional,
        priors: Object.keys(freshStore.known.priors).sort(),
        rates: Object.keys(freshStore.known.rates).sort(),
        samples: freshStore.puts.filter(n => !!n.is_sample).length,
      };
    },
  },
  {
    args: makeArgs({
      chain: bridged,
      date: bridged.day(2),
      store: bridgedStore,
    }),
    description: 'Looking up a bridged day derives a full price for it',
    expected: {is_found: true, priors: [bridged.day_name(1)]},
    measure: res => ({
      is_found: isClose({
        cents: res.cents,
        chain: bridged,
        day: bridged.day_name(2),
      }),
      priors: Object.keys(bridgedStore.known.priors),
    }),
  },
  {
    args: makeArgs({chain: latest, date: latest.day(4), store: latestStore}),
    description: 'Looking up the incomplete day gives a provisional price',
    expected: {
      is_found: true,
      is_provisional: true,
      reported: latest.day_name(4),
    },
    measure: res => ({
      is_found: isClose({
        cents: res.cents,
        chain: latest,
        day: latest.day_name(4),
      }),
      is_provisional: res.is_provisional,
      reported: latestStore.puts.find(n => !!n.is_provisional).date,
    }),
  },
  {
    args: Object.assign(
      makeArgs({chain: known, date: known.day(0), store: knownStore}),
      {lnd: unusedBlocksLnd(known)}
    ),
    description: 'A known price is returned without fetching blocks',
    expected: {
      cents: known.prices[known.day_name(0)] * centsPerDollar,
      is_provisional: false,
    },
    measure: res => res,
  },
  {
    args: Object.assign(
      makeArgs({chain: known, date: known.day(4), store: knownStore}),
      {lnd: unusedBlocksLnd(known)}
    ),
    description: 'A provisional price is returned without fetching blocks',
    expected: {cents: 1234567, is_provisional: true},
    measure: res => res,
  },
  {
    args: makeArgs({
      chain: fresh,
      date: `${fresh.day_name(0)}T20:00:00-07:00`,
      store: makeStore({chain: fresh, known: [0]}),
    }),
    description: 'A date with an offset is priced on its day in UTC',
    expected: {is_found: true},
    measure: res => ({
      is_found: isClose({
        cents: res.cents,
        chain: fresh,
        day: fresh.day_name(1),
      }),
    }),
  },
  {
    args: Object.assign(
      makeArgs({
        chain: reorged,
        date: reorged.day(3),
        store: makeStore({chain: reorged, known: [2]}),
      }),
      {remove_prices: () => {
        throw new Error('UnexpectedRemovalOfPrice');
      }}
    ),
    description: 'Nothing is removed while the blocks of a price are there',
    expected: {is_found: true},
    measure: res => ({
      is_found: isClose({
        cents: res.cents,
        chain: reorged,
        day: reorged.day_name(3),
      }),
    }),
  },
  {
    args: Object.assign(
      makeArgs({chain: reorged, date: reorged.day(3), store: reorgedStore}),
      {remove_prices: recordRemovals}
    ),
    description: 'A price from replaced blocks is reported and derived again',
    expected: {
      is_found: true,
      is_replaced: true,
      removals: [[{block_id: replaced, day: reorged.day_name(3)}]],
    },
    measure: res => {
      const day = reorged.day_name(3);

      return {
        removals,
        is_found: isClose({day, cents: res.cents, chain: reorged}),
        is_replaced: reorgedStore.known.rates[day].block_id !== replaced,
      };
    },
  },
  {
    args: Object.assign(
      makeArgs({
        chain: reorged,
        date: reorged.day(3),
        store: makeReorgedStore(),
      }),
      {remove_prices: ({}, cbk) => cbk([503, 'RemovePricesErr'])}
    ),
    description: 'Errors removing prices are passed back',
    error: [503, 'RemovePricesErr'],
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
