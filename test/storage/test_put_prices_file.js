const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../storage/put_prices_file');

const path = '/data/prices.json';

const makeFs = args => {
  const {files} = args;

  return {
    getFile: (path, cbk) => {
      const missing = {code: 'ENOENT'};

      return !files[path] ? cbk(missing) : cbk(null, Buffer.from(files[path]));
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
    args: makeArgs({}),
    description: 'Prices are written to the file',
    expected: {
      priors: {'2024-01-02': {cents: 2}},
      provisional: {},
      rates: {'2024-01-01': {cents: 1}},
      version: 1,
    },
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
      version: 1,
    },
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
      version: 1,
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
      version: 1,
    },
  },
  {
    args: makeArgs({removed: 'removed'}),
    description: 'Removed prices are expected to be an array',
    error: [400, 'ExpectedRemovedPricesToPutPricesFile'],
  },
  {
    args: makeArgs({
      fs: makeFs({
        files: {
          [path]: JSON.stringify({
            rates: {
              '2024-01-03': {cents: 3, hash: 'aa'},
              '2024-01-04': {cents: 4, hash: 'bb'},
            },
          }),
        },
      }),
      removed: [
        {day: '2024-01-03', hash: 'aa'},
        {day: '2024-01-04', hash: 'cc'},
      ],
    }),
    description: 'A removed price is only taken out when it is the same',
    expected: {
      priors: {'2024-01-02': {cents: 2}},
      provisional: {},
      rates: {
        '2024-01-01': {cents: 1},
        '2024-01-04': {cents: 4, hash: 'bb'},
      },
      version: 1,
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
      version: 1,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');

      return;
    }

    const res = await method(args);

    deepEqual(res, expected, 'Got expected result');

    args.fs.getFile(path, (err, res) => {
      deepEqual(JSON.parse(res.toString()), expected, 'File is written');
    });

    return;
  });
});

test('A file that cannot be read is not written over', async () => {
  const files = {[path]: 'not json'};

  const unparsed = method(makeArgs({fs: makeFs({files})}));

  await rejects(unparsed, [503, 'FailedToParsePricesFile'], 'Parse error');

  deepEqual(files, {[path]: 'not json'}, 'A file not parsed is left alone');

  const fs = makeFs({files});

  fs.getFile = (path, cbk) => cbk({code: 'EACCES'});

  await rejects(method(makeArgs({fs})), [503, 'FailedToReadPricesFile']);

  deepEqual(files, {[path]: 'not json'}, 'A file not read is left alone');

  return;
});

test('Each write has its own temporary file', async () => {
  const files = {};
  const temps = [];

  const fs = makeFs({files});

  const {writeFile} = fs;

  fs.writeFile = (path, contents, cbk) => {
    temps.push(path);

    return writeFile(path, contents, cbk);
  };

  await method(makeArgs({fs}));
  await method(makeArgs({fs}));

  const prefix = `${path}.${process.pid}.`;

  deepEqual(temps.length, 2, 'Each write uses a temporary file');
  deepEqual(temps[0] !== temps[1], true, 'The temporary files differ');
  deepEqual(temps.every(n => n.startsWith(prefix)), true, 'Named by process');
  deepEqual(Object.keys(files), [path], 'Only the prices file is left');

  return;
});
