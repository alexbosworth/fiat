const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const method = require('./../../chain/chain_rates');

const path = '/data/prices.json';

// Chains start well after the earliest supported day and shipped prices
const genesis = Date.parse('2030-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

const chain = makeChain({});

// A chain with few payments in its blocks, to price a day quickly
const lightChain = makeChain({payments_per_block: 5});

// LND for the chain that is not expected to be asked for any blocks
const unusedBlocksLnd = {
  blocks: Object.assign({}, chain.lnd.blocks, {
    getBlock: () => {
      throw new Error('UnexpectedFetchOfBlock');
    },
  }),
  chain: chain.lnd.chain,
};

// An in-memory file system
const makeFs = args => {
  return {
    getFile: (path, cbk) => {
      // Exit early when there is no file at the path
      if (!args.files[path]) {
        return cbk({code: 'ENOENT'});
      }

      return cbk(null, Buffer.from(args.files[path]));
    },
    makeDirectory: (path, cbk) => cbk(),
    renameFile: (from, to, cbk) => {
      if (!!args.is_rename_failing) {
        return cbk('err');
      }

      args.files[to] = args.files[from];

      delete args.files[from];

      return cbk();
    },
    writeFile: (path, contents, cbk) => {
      args.files[path] = contents;

      return cbk();
    },
  };
};

const makeRatesArgs = overrides => {
  const args = {path, fs: makeFs({files: {}}), lnd: makeChain({}).lnd};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const makeArgs = overrides => {
  const args = {
    lookup: {currency: 'BTC', date: chain.day(1), fiat: 'USD'},
    rates: makeRatesArgs({lnd: unusedBlocksLnd}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// Make the chain rates method and look up a rate with it
const lookupRate = ({lookup, rates}) => new Promise((resolve, reject) => {
  const {getChainRate} = method(rates);

  return getChainRate(lookup, (err, res) => {
    return !!err ? reject(err) : resolve(res);
  });
});

// Dates that are not readable dates on days of the calendar
const invalidDates = ['yesterday', '2024-01-01not-a-date', '2024-02-30'];

const tests = [
  {
    args: makeArgs({rates: makeRatesArgs({fs: undefined})}),
    description: 'File system methods are required',
    error: new Error('ExpectedFileSystemMethodsToMakeChainRates'),
  },
  {
    args: makeArgs({rates: makeRatesArgs({fs: {getFile: () => {}}})}),
    description: 'Complete file system methods are required',
    error: new Error('ExpectedFileSystemMethodsToMakeChainRates'),
  },
  {
    args: makeArgs({rates: makeRatesArgs({lnd: undefined})}),
    description: 'LND is required',
    error: new Error('ExpectedAuthenticatedLndToMakeChainRates'),
  },
  {
    args: makeArgs({rates: makeRatesArgs({path: undefined})}),
    description: 'A prices file path is required',
    error: new Error('ExpectedPricesFilePathToMakeChainRates'),
  },
  {
    args: makeArgs({rates: makeRatesArgs({blocks_path: path})}),
    description: 'The blocks file has to be apart from the prices file',
    error: new Error('ExpectedBlocksPathOtherThanPricesPathToMakeChainRates'),
  },
  {
    args: makeArgs({
      lookup: {currency: 'LTC', date: chain.day(1), fiat: 'USD'},
    }),
    description: 'The currency to look up a rate for must be BTC',
    error: [400, 'UnsupportedCurrencyToGetChainRate'],
  },
  {
    args: makeArgs({lookup: {currency: 'BTC', fiat: 'USD'}}),
    description: 'A date is required to look up a rate',
    error: [400, 'ExpectedDateToGetChainRate'],
  },
  {
    args: makeArgs({
      lookup: {currency: 'BTC', date: chain.day(1), fiat: 'EUR'},
    }),
    description: 'The fiat currency to look up a rate in must be USD',
    error: [400, 'UnsupportedFiatToGetChainRate'],
  },
  {
    args: makeArgs({
      lookup: {currency: 'BTC', date: '2021-10-19T23:59:59.999Z', fiat: 'USD'},
    }),
    description: 'A date must be in the supported range',
    error: [400, 'DateBeforeSupportedRangeToGetChainRate', {
      earliest_day: '2021-10-20',
    }],
  },
  {
    args: makeArgs({
      rates: makeRatesArgs({fs: makeFs({files: {[path]: 'not json'}})}),
    }),
    description: 'A corrupt prices file is an error',
    error: [503, 'FailedToParsePricesFile'],
  },
  {
    args: makeArgs({
      rates: makeRatesArgs({
        fs: makeFs({files: {}, is_rename_failing: true}),
        lnd: lightChain.lnd,
      }),
    }),
    description: 'A failure to swap in the prices file is an error',
    error: [503, 'FailedToReplacePricesFile'],
  },
].concat(invalidDates.map(date => ({
  args: makeArgs({lookup: {date, currency: 'BTC', fiat: 'USD'}}),
  description: `${date} is not a date that a rate can be looked up for`,
  error: [400, 'ExpectedValidDateToGetChainRate'],
})));

tests.forEach(({args, description, error}) => {
  return test(description, async () => {
    await rejects(lookupRate(args), error, 'Got expected error');

    return;
  });
});
