const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {forgetEstimates} = require('./../../chain/estimates');
const {methodVersion} = require('./../../chain/known');

const path = '/data/prices.json';
const {parse} = JSON;
const {stringify} = JSON;
const {version} = methodVersion({});

// Estimates from blocks that were replaced, and from blocks that were not
const bad = {version, block_id: 'aa', blocks: [1, 2], cents: 1e6};
const good = {version, block_id: 'bb', blocks: [3, 4], cents: 2e6};

// An estimate that another process stored for a day
const newer = {version, block_id: 'cc', blocks: [5, 6], cents: 3e6};

const makeFs = files => ({
  files,
  getFile: (path, cbk) => {
    return !files[path] ? cbk({code: 'ENOENT'}) : cbk(null, files[path]);
  },
  makeDirectory: (path, cbk) => cbk(),
  renameFile: (from, to, cbk) => {
    files[to] = files[from];

    delete files[from];

    return cbk();
  },
  writeFile: (path, contents, cbk) => {
    files[path] = contents;

    return cbk();
  },
});

const makeArgs = overrides => {
  const args = {
    path,
    estimates: {priors: {}, provisional: {}, rates: {}},
    fs: makeFs({}),
    removed: [],
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const makeExpected = overrides => {
  const expected = {
    err: undefined,
    estimates: {priors: {}, provisional: {}, rates: {}},
    prices: undefined,
  };

  Object.keys(overrides).forEach(k => expected[k] = overrides[k]);

  return expected;
};

// Forget estimates, with any error and what is known and stored after
const forget = args => new Promise(resolve => {
  return forgetEstimates(args, err => {
    const file = !args.fs ? undefined : args.fs.files[path];

    return resolve({
      err,
      estimates: args.estimates,
      prices: !file ? undefined : parse(file),
    });
  });
});

const tests = [
  {
    args: makeArgs({estimates: undefined}),
    description: 'Known estimates are required',
    expected: makeExpected({
      err: [400, 'ExpectedKnownEstimatesToForgetEstimates'],
      estimates: undefined,
    }),
  },
  {
    args: makeArgs({fs: undefined}),
    description: 'File system methods are required',
    expected: makeExpected({
      err: [400, 'ExpectedFileSystemMethodsToForgetEstimates'],
    }),
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A prices file path is required',
    expected: makeExpected({
      err: [400, 'ExpectedPricesFilePathToForgetEstimates'],
    }),
  },
  {
    args: makeArgs({removed: undefined}),
    description: 'Removed estimates are required',
    expected: makeExpected({
      err: [400, 'ExpectedRemovedEstimatesToForgetEstimates'],
    }),
  },
  {
    args: makeArgs({
      estimates: {
        priors: {},
        provisional: {},
        rates: {'2024-01-01': bad, '2024-01-02': bad, '2024-01-03': good},
      },
      fs: makeFs({
        [path]: stringify({
          priors: {},
          rates: {'2024-01-01': bad, '2024-01-02': newer, '2024-01-03': good},
          version: 2,
        }),
      }),
      removed: [
        {block_id: 'aa', day: '2024-01-01'},
        {block_id: 'aa', day: '2024-01-02'},
      ],
    }),
    description: 'Estimates from replaced blocks are forgotten for good',
    expected: makeExpected({
      estimates: {
        priors: {},
        provisional: {},
        rates: {'2024-01-02': newer, '2024-01-03': good},
      },
      prices: {
        priors: {},
        provisional: {},
        rates: {'2024-01-02': newer, '2024-01-03': good},
        version: 2,
      },
    }),
  },
  {
    args: makeArgs({}),
    description: 'Nothing is written when there is nothing to forget',
    expected: makeExpected({}),
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await forget(args), expected, 'Got expected result');

    return;
  });
});
