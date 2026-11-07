const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/estimates/save_kept_blocks');
const {methodVersion} = require('./../../chain/known');

const bufferAsHex = buffer => buffer.toString('hex');
const path = '/data/blocks.json';
const {version} = methodVersion({});

// A block as it is kept after it is fetched
const makeBlock = ({height}) => ({
  id: bufferAsHex(Buffer.alloc(32, height)),
  outputs: [1000, 2000],
  previous: bufferAsHex(Buffer.alloc(32, height - 1)),
  time: 1700000000 + height,
  transactions: 1,
});

// Kept blocks out of order, with one below the floor of recent blocks
const makeKept = ({saved}) => ({
  blocks: new Map([101, 99, 100].map(height => [height, makeBlock({height})])),
  floor: 100,
  saved: new Set(saved),
});

const makeFs = ({writeFile}) => ({
  writeFile,
  getFile: (file, cbk) => cbk({code: 'ENOENT'}),
  makeDirectory: (directory, cbk) => cbk(),
  renameFile: (from, to, cbk) => cbk(),
});

// The recent blocks as they are stored in the blocks file
const recent = [100, 101].map(height => {
  return Object.assign({height}, makeBlock({height}));
});

// A logger that keeps the lines logged to it
const makeLogger = () => {
  const logged = [];

  return {logged, error: line => logged.push(line)};
};

const makeArgs = overrides => {
  const args = {
    path,
    fs: makeFs({
      writeFile: (file, contents, cbk) => {
        const written = JSON.parse(contents);

        deepEqual(written.blocks, recent, 'Got recent blocks');
        deepEqual(written.method_version, version, 'Got method version');

        return cbk();
      },
    }),
    kept: makeKept({saved: [100]}),
    logger: makeLogger(),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({
      fs: makeFs({
        writeFile: () => {
          throw new Error('UnexpectedWriteOfBlocksFile');
        },
      }),
      kept: makeKept({saved: [100, 101]}),
    }),
    description: 'Nothing is written when the file has the recent blocks',
    expected: {is_saved: false, logged: []},
  },
  {
    args: makeArgs({}),
    description: 'Recent blocks are written in order when some are missing',
    expected: {is_saved: true, logged: []},
  },
  {
    args: makeArgs({
      fs: makeFs({writeFile: (file, contents, cbk) => cbk('err')}),
    }),
    description: 'A blocks file that cannot be written is logged, not saved',
    expected: {
      is_saved: false,
      logged: [{
        failed_to_save_kept_blocks: {
          path,
          err: [503, 'FailedToWriteBlocksFile', {err: 'err'}],
        },
      }],
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    const res = await method(args);

    const got = {is_saved: res.is_saved, logged: args.logger.logged};

    deepEqual(got, expected, 'Got expected result');

    return;
  });
});
