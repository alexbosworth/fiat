const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const {makeStore} = require('./../fixtures');
const method = require('./../../chain/estimates/get_price_for_date');
const {methodVersion} = require('./../../chain/known');

const centsPerDollar = 100;
const genesis = Date.parse('2026-01-01T00:00:00.000Z') / 1000;
const {version} = methodVersion({});

const chain = makeChain({genesis});

// Make a store with a price from blocks past the chain tip
const makeAheadStore = ({}) => {
  const store = makeStore({chain, known: [2]});

  store.known.rates[chain.day_name(5)] = {
    version,
    block_id: 'ff'.repeat(32),
    blocks: [chain.tip + 10, chain.tip + 150],
    cents: chain.prices[chain.day_name(2)] * centsPerDollar,
  };

  return store;
};

const aheadStore = makeAheadStore({});

const makeArgs = overrides => {
  const store = makeStore({});

  const args = {
    date: chain.day(1),
    get_prices: store.get_prices,
    height: chain.tip,
    lnd: chain.lnd,
    put_price: store.put_price,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({blocks: {}}),
    description: 'Kept blocks are expected to be a map',
    error: [400, 'ExpectedKeptBlocksMapToGetPriceForDate'],
  },
  {
    args: makeArgs({date: undefined}),
    description: 'A date is required',
    error: [400, 'ExpectedDateToGetPriceForDate'],
  },
  {
    args: makeArgs({date: 'yesterday'}),
    description: 'A valid date is required',
    error: [400, 'ExpectedValidDateToGetPriceForDate'],
  },
  {
    args: makeArgs({date: '2026-01-02not-a-date'}),
    description: 'A date has to be readable as a whole',
    error: [400, 'ExpectedValidDateToGetPriceForDate'],
  },
  {
    args: makeArgs({date: '2026-02-30'}),
    description: 'A date has to be on a day of the calendar',
    error: [400, 'ExpectedValidDateToGetPriceForDate'],
  },
  {
    args: makeArgs({date: '2021-10-19T23:59:59.999Z'}),
    description: 'A date in the supported range is required',
    error: [400, 'DateBeforeSupportedRangeToGetPriceForDate', {
      earliest_day: '2021-10-20',
    }],
  },
  {
    args: makeArgs({get_prices: undefined}),
    description: 'A get prices function is required',
    error: [400, 'ExpectedGetPricesFunctionToGetPriceForDate'],
  },
  {
    args: makeArgs({height: undefined}),
    description: 'The current chain height is required',
    error: [400, 'ExpectedCurrentChainHeightToGetPriceForDate'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetPriceForDate'],
  },
  {
    args: makeArgs({put_price: undefined}),
    description: 'A put price function is required',
    error: [400, 'ExpectedPutPriceFunctionToGetPriceForDate'],
  },
  {
    args: makeArgs({remove_prices: 'remove_prices'}),
    description: 'A remove prices function is expected to be a function',
    error: [400, 'ExpectedRemovePricesFunctionToGetPriceForDate'],
  },
  {
    args: makeArgs({get_prices: ({}, cbk) => cbk([503, 'GetPricesErr'])}),
    description: 'Errors getting known prices are passed back',
    error: [503, 'GetPricesErr'],
  },
  {
    args: makeArgs({get_prices: ({}, cbk) => cbk()}),
    description: 'Known prices are expected',
    error: [503, 'ExpectedKnownPricesToGetPriceForDate'],
  },
  {
    args: makeArgs({
      lnd: {
        blocks: {
          getBlockHash: ({}, cbk) => cbk(null, {block_hash: Buffer.alloc(32)}),
          getBlockHeader: ({}, cbk) => cbk({details: 'err'}),
        },
      },
    }),
    description: 'Errors getting block headers are passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingBlockHeader',
      {err: {details: 'err'}},
    ],
  },
  {
    args: makeArgs({
      date: chain.day(3),
      get_prices: aheadStore.get_prices,
      put_price: aheadStore.put_price,
      remove_prices: () => {
        throw new Error('UnexpectedRemovalOfPrices');
      },
    }),
    description: 'A price beyond the chain tip is set aside, not removed',
    expected: {cents: 5556326, is_provisional: false},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await method(args), expected, 'Got expected price');
    }

    return;
  });
});
