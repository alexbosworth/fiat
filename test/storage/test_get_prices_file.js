const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../storage/get_prices_file');

const makeFs = contents => ({getFile: (path, cbk) => cbk(null, contents)});

const day = '2024-01-01';

const file = JSON.stringify({rates: {[day]: {cents: 1}}});

const makeArgs = overrides => {
  const args = {fs: makeFs(file), path: 'p'};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({fs: undefined}),
    description: 'File system methods are required',
    error: [400, 'ExpectedFileSystemMethodsToGetPricesFile'],
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A path is required',
    error: [400, 'ExpectedPathToGetPricesFile'],
  },
  {
    args: makeArgs({fs: makeFs('[]')}),
    description: 'A prices object is expected',
    error: [503, 'ExpectedPricesObjectInPricesFile'],
  },
  {
    args: makeArgs({fs: makeFs('not json')}),
    description: 'Valid JSON is expected',
    error: [503, 'FailedToParsePricesFile'],
  },
  {
    args: makeArgs({fs: makeFs(JSON.stringify({rates: {}, version: 99}))}),
    description: 'A file in an unknown format is an error',
    error: [503, 'UnsupportedPricesFileVersion'],
  },
  {
    args: makeArgs({
      fs: makeFs(JSON.stringify({rates: {[day]: {cents: 1}}, version: 1})),
    }),
    description: 'A file in the current format is read',
    expected: {priors: {}, provisional: {}, rates: {[day]: {cents: 1}}},
  },
  {
    args: makeArgs({
      fs: makeFs(JSON.stringify({provisional: {[day]: {cents: 2}}})),
    }),
    description: 'Provisional prices are read from the file',
    expected: {priors: {}, provisional: {[day]: {cents: 2}}, rates: {}},
  },
  {
    args: makeArgs({
      fs: makeFs(JSON.stringify({
        priors: {[day]: [1]},
        provisional: {[day]: null},
        rates: {
          '2024-01-02': {cents: 2},
          '2024-02-30': {cents: 3},
          'day': {cents: 4},
          [day]: 'cents',
        },
      })),
    }),
    description: 'Entries that are not prices for a day are skipped',
    expected: {priors: {}, provisional: {}, rates: {'2024-01-02': {cents: 2}}},
  },
  {
    args: makeArgs({fs: {getFile: (path, cbk) => cbk({code: 'ENOENT'})}}),
    description: 'A missing file is an empty set of prices',
    expected: {priors: {}, provisional: {}, rates: {}},
  },
  {
    args: makeArgs({fs: makeFs(Buffer.alloc(0))}),
    description: 'An empty file is an empty set of prices',
    expected: {priors: {}, provisional: {}, rates: {}},
  },
  {
    args: makeArgs({fs: makeFs(undefined)}),
    description: 'A file read as nothing is an empty set of prices',
    expected: {priors: {}, provisional: {}, rates: {}},
  },
  {
    args: makeArgs({fs: {getFile: (path, cbk) => cbk({code: 'EACCES'})}}),
    description: 'A file that cannot be read is an error',
    error: [503, 'FailedToReadPricesFile', {err: {code: 'EACCES'}}],
  },
  {
    args: makeArgs({}),
    description: 'Prices are read from the file',
    expected: {priors: {}, provisional: {}, rates: {'2024-01-01': {cents: 1}}},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await method(args), expected, 'Got expected result');
    }

    return;
  });
});
