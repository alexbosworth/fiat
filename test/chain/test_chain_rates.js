const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {makeChain: makeFixtureChain} = require('./../fixtures');
const method = require('./../../chain/chain_rates');

const path = '/data/prices.json';

// Chains start well after the earliest supported day and shipped prices
const genesis = Date.parse('2030-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

// An in-memory file system
const makeFs = args => {
  const {files} = args;

  return {
    getFile: (path, cbk) => {
      if (!files[path]) {
        return cbk({code: 'ENOENT'});
      }

      return cbk(null, Buffer.from(files[path]));
    },
    makeDirectory: (path, cbk) => cbk(),
    renameFile: (from, to, cbk) => {
      if (!!args.is_rename_failing) {
        return cbk('err');
      }

      files[to] = files[from];

      delete files[from];

      return cbk();
    },
    writeFile: (path, contents, cbk) => {
      if (!!args.is_write_failing) {
        return cbk('err');
      }

      files[path] = contents;

      return cbk();
    },
  };
};

const makeArgs = overrides => {
  const args = {path, fs: makeFs({files: {}}), lnd: makeChain({}).lnd};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const priceAt = ({date, getChainRate}) => {
  return new Promise((resolve, reject) => {
    return getChainRate({date, currency: 'BTC', fiat: 'USD'}, (err, res) => {
      return !!err ? reject(err) : resolve(res);
    });
  });
};

const tests = [
  {
    args: makeArgs({fs: undefined}),
    description: 'File system methods are required',
    error: 'ExpectedFileSystemMethodsToMakeChainRates',
  },
  {
    args: makeArgs({fs: {getFile: () => {}}}),
    description: 'Complete file system methods are required',
    error: 'ExpectedFileSystemMethodsToMakeChainRates',
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: 'ExpectedAuthenticatedLndToMakeChainRates',
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A prices file path is required',
    error: 'ExpectedPricesFilePathToMakeChainRates',
  },
];

tests.forEach(({args, description, error}) => {
  return test(description, () => {
    throws(() => method(args), new Error(error), 'Got expected error');

    return;
  });
});

test('Rate lookup arguments are validated', async () => {
  const chain = makeChain({});

  const {getChainRate} = method(makeArgs({lnd: chain.lnd}));

  const lookup = args => new Promise((resolve, reject) => {
    return getChainRate(args, (err, res) => {
      return !!err ? reject(err) : resolve(res);
    });
  });

  await rejects(
    lookup({currency: 'LTC', date: chain.day(1), fiat: 'USD'}),
    [400, 'UnsupportedCurrencyToGetChainRate'],
    'Currency must be BTC'
  );

  await rejects(
    lookup({currency: 'BTC', fiat: 'USD'}),
    [400, 'ExpectedDateToGetChainRate'],
    'Date is required'
  );

  await rejects(
    lookup({currency: 'BTC', date: chain.day(1), fiat: 'EUR'}),
    [400, 'UnsupportedFiatToGetChainRate'],
    'Fiat must be USD'
  );

  const invalid = ['yesterday', '2024-01-01not-a-date', '2024-02-30'];

  for (const date of invalid) {
    await rejects(
      lookup({date, currency: 'BTC', fiat: 'USD'}),
      [400, 'ExpectedValidDateToGetChainRate'],
      'Date must be a readable date on a day of the calendar'
    );
  }

  await rejects(
    lookup({currency: 'BTC', date: '2021-10-19T23:59:59.999Z', fiat: 'USD'}),
    [400, 'DateBeforeSupportedRangeToGetChainRate', {
      earliest_day: '2021-10-20',
    }],
    'Date must be in the supported range'
  );

  deepEqual(chain.calls.blocks, 0, 'No blocks are fetched for bad lookups');

  return;
});

test('A corrupt prices file is an error', async () => {
  const fs = makeFs({files: {}});

  fs.getFile = (path, cbk) => cbk(null, Buffer.from('not json'));

  const {getChainRate} = method(makeArgs({fs}));

  await rejects(
    priceAt({getChainRate, date: makeChain({}).day(1)}),
    [503, 'FailedToParsePricesFile'],
    'Got expected error'
  );

  return;
});

test('A failure to swap in the prices file is an error', async () => {
  const fs = makeFs({files: {}, is_rename_failing: true});

  const {getChainRate} = method(makeArgs({fs}));

  await rejects(
    priceAt({getChainRate, date: makeChain({}).day(1)}),
    [503, 'FailedToReplacePricesFile'],
    'Got expected error'
  );

  return;
});
