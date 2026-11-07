const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../storage/put_blocks_file');

const bufferAsHex = buffer => buffer.toString('hex');
const methodVersion = '1.abcdef12';
const path = '/data/blocks.json';

const blocks = [{
  height: 100,
  id: bufferAsHex(Buffer.alloc(32, 1)),
  outputs: [1000, 2000],
  previous: bufferAsHex(Buffer.alloc(32)),
  time: 1700000000,
  transactions: 1,
}];

const makeFs = overrides => Object.assign({
  getFile: (file, cbk) => cbk({code: 'ENOENT'}),
  makeDirectory: (directory, cbk) => cbk(),
  renameFile: (from, to, cbk) => cbk(),
  writeFile: (file, contents, cbk) => cbk(),
},
overrides);

const makeArgs = overrides => {
  const args = {blocks, path, fs: makeFs({}), method_version: methodVersion};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({blocks: undefined}),
    description: 'Blocks are required',
    error: [400, 'ExpectedBlocksToPutBlocksFile'],
  },
  {
    args: makeArgs({fs: {getFile: () => {}}}),
    description: 'File system methods are required',
    error: [400, 'ExpectedFileSystemMethodsToPutBlocksFile'],
  },
  {
    args: makeArgs({method_version: undefined}),
    description: 'A method version is required',
    error: [400, 'ExpectedMethodVersionToPutBlocksFile'],
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A path is required',
    error: [400, 'ExpectedPathToPutBlocksFile'],
  },
  {
    args: makeArgs({
      fs: makeFs({writeFile: (file, contents, cbk) => cbk('err')}),
    }),
    description: 'A failure to write the file is an error',
    error: [503, 'FailedToWriteBlocksFile', {err: 'err'}],
  },
  {
    args: makeArgs({fs: makeFs({renameFile: (from, to, cbk) => cbk('err')})}),
    description: 'A failure to swap in the file is an error',
    error: [503, 'FailedToReplaceBlocksFile', {err: 'err'}],
  },
  {
    args: makeArgs({
      fs: makeFs({
        renameFile: (from, to, cbk) => {
          deepEqual(to, path, 'The written file takes the place of the file');

          return cbk();
        },
        writeFile: (file, contents, cbk) => {
          const written = {blocks, method_version: methodVersion, version: 1};

          deepEqual(JSON.parse(contents), written, 'Written');

          return cbk();
        },
      }),
    }),
    description: 'Blocks are written in place of the file',
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
