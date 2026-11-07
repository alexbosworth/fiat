const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const {makeFs} = require('./../fixtures');
const method = require('./../../chain/estimates/get_chain_price');
const {methodVersion} = require('./../../chain/known');

const blocksPath = '/data/blocks.json';
const damaged = 'not json';
const genesis = Date.parse('2030-01-01T00:00:00.000Z') / 1000;
const path = '/data/prices.json';
const shippedCents = 123456789;
const storedCents = 4012300;
const {version} = methodVersion({});

const chain = makeChain({genesis});

const date = chain.day_name(1);
const nextDate = chain.day_name(2);

// A file system with a prices file that cannot be parsed and cannot change
const damagedFs = {getFile: (file, cbk) => cbk(null, Buffer.from(damaged))};

// LND for the chain that fails to get blocks
const failingLnd = {
  blocks: Object.assign({}, chain.lnd.blocks, {
    getBlock: ({}, cbk) => cbk({details: 'err'}),
  }),
  chain: chain.lnd.chain,
};

// A file system that cannot be read from or written to
const unusedFs = {
  getFile: () => {
    throw new Error('UnexpectedReadOfFile');
  },
};

const makeArgs = overrides => {
  const args = {
    date,
    path,
    estimates: {provisional: {}, samples: 0},
    fs: {},
    known: {[date]: {version, cents: shippedCents}},
    lnd: {},
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({date: undefined}),
    description: 'A date is required',
    error: [400, 'ExpectedDateToGetChainPrice'],
  },
  {
    args: makeArgs({date: `${date}not-a-date`}),
    description: 'A date has to be valid',
    error: [400, 'ExpectedValidDateToGetChainPrice'],
  },
  {
    args: makeArgs({estimates: undefined}),
    description: 'Estimates are required',
    error: [400, 'ExpectedKnownEstimatesToGetChainPrice'],
  },
  {
    args: makeArgs({fs: undefined}),
    description: 'File system methods are required',
    error: [400, 'ExpectedFileSystemMethodsToGetChainPrice'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetChainPrice'],
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A prices file path is required',
    error: [400, 'ExpectedPricesFilePathToGetChainPrice'],
  },
  {
    args: makeArgs({blocks_path: blocksPath}),
    description: 'Kept blocks are required with a blocks path',
    error: [400, 'ExpectedKeptBlocksToGetChainPrice'],
  },
  {
    args: makeArgs({}),
    description: 'A shipped price is returned without using LND or files',
    expected: {cents: shippedCents},
  },
  {
    args: makeArgs({fs: damagedFs}),
    description: 'A damaged prices file does not stop a shipped price',
    expected: {cents: shippedCents},
  },
  {
    args: makeArgs({date: nextDate, fs: damagedFs, lnd: chain.lnd}),
    description: 'A damaged prices file stops a price that needs the file',
    error: [503, 'FailedToParsePricesFile'],
  },
  {
    args: makeArgs({
      blocks_path: blocksPath,
      date: nextDate,
      estimates: {
        priors: {},
        provisional: {},
        rates: {[nextDate]: {version, cents: storedCents}},
        samples: 0,
      },
      fs: unusedFs,
      kept: {},
      lnd: chain.lnd,
    }),
    description: 'Kept blocks are not read for a day with a stored price',
    expected: {cents: storedCents, is_provisional: false},
  },
  {
    args: makeArgs({
      blocks_path: blocksPath,
      date: nextDate,
      fs: makeFs({files: {}}),
      kept: {},
      lnd: failingLnd,
    }),
    description: 'A failure to get blocks for a price is passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingChainBlock',
      {err: {details: 'err'}},
    ],
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
