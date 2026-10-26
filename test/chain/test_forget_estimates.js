const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {forgetEstimates} = require('./../../chain/estimates');
const {methodVersion} = require('./../../chain/known');

const path = '/data/prices.json';
const {version} = methodVersion({});

const makeFs = files => ({
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

const tests = [
  {
    args: makeArgs({estimates: undefined}),
    description: 'Known estimates are required',
    error: [400, 'ExpectedKnownEstimatesToForgetEstimates'],
  },
  {
    args: makeArgs({fs: undefined}),
    description: 'File system methods are required',
    error: [400, 'ExpectedFileSystemMethodsToForgetEstimates'],
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A prices file path is required',
    error: [400, 'ExpectedPricesFilePathToForgetEstimates'],
  },
  {
    args: makeArgs({removed: undefined}),
    description: 'Removed estimates are required',
    error: [400, 'ExpectedRemovedEstimatesToForgetEstimates'],
  },
];

tests.forEach(({args, description, error}) => {
  return test(description, async () => {
    await rejects(forgetEstimates(args), error, 'Got expected error');

    return;
  });
});

test('Estimates from replaced blocks are forgotten for good', async () => {
  const bad = {version, blocks: [1, 2], cents: 1e6, hash: 'aa'};
  const good = {version, blocks: [3, 4], cents: 2e6, hash: 'bb'};
  const newer = {version, blocks: [5, 6], cents: 3e6, hash: 'cc'};

  const files = {
    [path]: JSON.stringify({
      priors: {},
      // Another process stored a newer price for the second day
      rates: {'2024-01-01': bad, '2024-01-02': newer, '2024-01-03': good},
      version: 1,
    }),
  };

  const estimates = {
    priors: {},
    provisional: {},
    rates: {'2024-01-01': bad, '2024-01-02': bad, '2024-01-03': good},
  };

  await forgetEstimates({
    estimates,
    path,
    fs: makeFs(files),
    removed: [
      {day: '2024-01-01', hash: 'aa'},
      {day: '2024-01-02', hash: 'aa'},
    ],
  });

  const expected = {'2024-01-02': newer, '2024-01-03': good};

  deepEqual(JSON.parse(files[path]).rates, expected, 'The file forgets them');
  deepEqual(estimates.rates, expected, 'The known estimates forget them');

  return;
});

test('Nothing is written when there is nothing to forget', async () => {
  const files = {};

  await forgetEstimates(makeArgs({fs: makeFs(files)}));

  deepEqual(files, {}, 'Nothing is written');

  return;
});
