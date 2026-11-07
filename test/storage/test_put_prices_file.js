const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../storage/put_prices_file');

const path = '/data/prices.json';

// The prices that are written for the default arguments
const written = {
  priors: {'2024-01-02': {cents: 2}},
  provisional: {},
  rates: {'2024-01-01': {cents: 1}},
  version: 2,
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
      if (!!args.is_write_failing) {
        return cbk('err');
      }

      args.files[path] = contents;

      return cbk();
    },
  };
};

// A file system with a prices file that is not to be written over
const makeKeptFs = ({contents, err}) => ({
  getFile: (file, cbk) => !err ? cbk(null, Buffer.from(contents)) : cbk(err),
  makeDirectory: (directory, cbk) => cbk(),
  renameFile: () => {
    throw new Error('UnexpectedSwapOfPricesFile');
  },
  writeFile: () => {
    throw new Error('UnexpectedWriteOfPricesFile');
  },
});

// A file system that checks the prices are written to a temporary file next
// to the prices file, which then takes the place of the prices file
const makeCheckedFs = ({expected}) => {
  const temps = [];

  return {
    getFile: (file, cbk) => cbk({code: 'ENOENT'}),
    makeDirectory: (directory, cbk) => cbk(),
    renameFile: (from, to, cbk) => {
      deepEqual({from, to}, {to: path, from: temps[0]}, 'Swapped into place');

      return cbk();
    },
    writeFile: (file, contents, cbk) => {
      ok(file.startsWith(`${path}.${process.pid}.`), 'Written next to it');
      deepEqual(JSON.parse(contents), expected, 'The prices are written');

      temps.push(file);

      return cbk();
    },
  };
};

const makeArgs = overrides => {
  const args = {
    path,
    fs: makeFs({files: {}}),
    priors: {'2024-01-02': {cents: 2}},
    rates: {'2024-01-01': {cents: 1}},
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({fs: undefined}),
    description: 'File system methods are required',
    error: [400, 'ExpectedFileSystemMethodsToPutPricesFile'],
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A path is required',
    error: [400, 'ExpectedPathToPutPricesFile'],
  },
  {
    args: makeArgs({priors: undefined}),
    description: 'Priors are required',
    error: [400, 'ExpectedPriorsToPutPricesFile'],
  },
  {
    args: makeArgs({rates: undefined}),
    description: 'Rates are required',
    error: [400, 'ExpectedRatesToPutPricesFile'],
  },
  {
    args: makeArgs({provisional: 'provisional'}),
    description: 'Provisional prices are expected to be an object',
    error: [400, 'ExpectedProvisionalPricesToPutPricesFile'],
  },
  {
    args: makeArgs({priors: {'2024-01-02': null}}),
    description: 'Priors are expected to be price objects',
    error: [400, 'ExpectedPriorsToPutPricesFile'],
  },
  {
    args: makeArgs({provisional: {'2024-01-02': null}}),
    description: 'Provisional prices are expected to be price objects',
    error: [400, 'ExpectedProvisionalPricesToPutPricesFile'],
  },
  {
    args: makeArgs({rates: {'2024-01-01': 1}}),
    description: 'Rates are expected to be price objects',
    error: [400, 'ExpectedRatesToPutPricesFile'],
  },
  {
    args: makeArgs({rates: {'2024-02-30': {cents: 1}}}),
    description: 'Rates are expected to be for days of the calendar',
    error: [400, 'ExpectedRatesToPutPricesFile'],
  },
  {
    args: makeArgs({removed: 'removed'}),
    description: 'Removed prices are expected to be an array',
    error: [400, 'ExpectedRemovedPricesToPutPricesFile'],
  },
  {
    args: makeArgs({fs: makeKeptFs({contents: 'not json'})}),
    description: 'A file that cannot be parsed is not written over',
    error: [503, 'FailedToParsePricesFile'],
  },
  {
    args: makeArgs({fs: makeKeptFs({err: {code: 'EACCES'}})}),
    description: 'A file that cannot be read is not written over',
    error: [503, 'FailedToReadPricesFile', {err: {code: 'EACCES'}}],
  },
  {
    args: makeArgs({fs: makeFs({files: {}, is_write_failing: true})}),
    description: 'Errors writing the file are passed back',
    error: [503, 'FailedToWritePricesFile'],
  },
  {
    args: makeArgs({fs: makeFs({files: {}, is_rename_failing: true})}),
    description: 'Errors swapping in the file are passed back',
    error: [503, 'FailedToReplacePricesFile'],
  },
  {
    args: makeArgs({fs: makeCheckedFs({expected: written})}),
    description: 'Prices are written to a temporary file that is swapped in',
    expected: written,
  },
  {
    args: makeArgs({
      fs: makeFs({
        files: {
          [path]: JSON.stringify({
            priors: {'2024-01-02': {cents: 3}, '2024-01-03': {cents: 4}},
            rates: {'2024-01-02': {cents: 5}, '2024-01-04': {cents: 6}},
          }),
        },
      }),
    }),
    description: 'Prices are merged with the prices already in the file',
    expected: {
      priors: {'2024-01-03': {cents: 4}},
      provisional: {},
      rates: {
        '2024-01-01': {cents: 1},
        '2024-01-02': {cents: 5},
        '2024-01-04': {cents: 6},
      },
      version: 2,
    },
  },
  {
    args: makeArgs({
      fs: makeFs({
        files: {
          [path]: JSON.stringify({
            rates: {'2024-01-04': {cents: 6}},
            version: 1,
          }),
        },
      }),
    }),
    description: 'Prices in an earlier format are replaced',
    expected: written,
  },
  {
    args: makeArgs({
      fs: makeFs({
        files: {
          [path]: JSON.stringify({
            rates: {'2024-01-02': {cents: 5, version: 'old'}},
          }),
        },
      }),
      priors: {'2024-01-02': {cents: 2, version: 'new'}},
      provisional: {'2024-01-02': {blocks: [1, 2], cents: 3, version: 'new'}},
    }),
    description: 'A rate of another version leaves the prices of the day',
    expected: {
      priors: {'2024-01-02': {cents: 2, version: 'new'}},
      provisional: {'2024-01-02': {blocks: [1, 2], cents: 3, version: 'new'}},
      rates: {
        '2024-01-01': {cents: 1},
        '2024-01-02': {cents: 5, version: 'old'},
      },
      version: 2,
    },
  },
  {
    args: makeArgs({
      fs: makeFs({
        files: {
          [path]: JSON.stringify({
            priors: {'2024-01-03': null},
            provisional: {'2024-01-04': null},
            rates: {'2024-01-05': null},
          }),
        },
      }),
      provisional: {'2024-01-04': {blocks: [1, 2], cents: 3}},
    }),
    description: 'Damaged entries in the file are dropped',
    expected: {
      priors: {'2024-01-02': {cents: 2}},
      provisional: {'2024-01-04': {blocks: [1, 2], cents: 3}},
      rates: {'2024-01-01': {cents: 1}},
      version: 2,
    },
  },
  {
    args: makeArgs({
      fs: makeFs({
        files: {
          [path]: JSON.stringify({
            rates: {
              '2024-01-03': {block_id: 'aa', cents: 3},
              '2024-01-04': {block_id: 'bb', cents: 4},
            },
          }),
        },
      }),
      removed: [
        {block_id: 'aa', day: '2024-01-03'},
        {block_id: 'cc', day: '2024-01-04'},
      ],
    }),
    description: 'A removed price is only taken out when it is the same',
    expected: {
      priors: {'2024-01-02': {cents: 2}},
      provisional: {},
      rates: {
        '2024-01-01': {cents: 1},
        '2024-01-04': {block_id: 'bb', cents: 4},
      },
      version: 2,
    },
  },
  {
    args: makeArgs({
      fs: makeFs({
        files: {
          [path]: JSON.stringify({
            provisional: {
              '2024-01-03': {blocks: [1, 5], cents: 10},
              '2024-01-04': {blocks: [5, 9], cents: 11},
              '2024-01-05': {blocks: [10, 25], cents: 8},
            },
          }),
        },
      }),
      provisional: {
        '2024-01-01': {blocks: [1, 2], cents: 9},
        '2024-01-05': {blocks: [10, 20], cents: 7},
      },
    }),
    description: 'Provisional prices from the latest blocks and days are kept',
    expected: {
      priors: {'2024-01-02': {cents: 2}},
      provisional: {
        '2024-01-04': {blocks: [5, 9], cents: 11},
        '2024-01-05': {blocks: [10, 25], cents: 8},
      },
      rates: {'2024-01-01': {cents: 1}},
      version: 2,
    },
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
