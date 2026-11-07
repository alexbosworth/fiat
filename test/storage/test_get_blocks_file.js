const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../storage/get_blocks_file');

const asFile = obj => JSON.stringify(obj);
const bufferAsHex = buffer => buffer.toString('hex');
const methodVersion = '1.abcdef12';

const makeBlock = overrides => Object.assign({
  height: 100,
  id: bufferAsHex(Buffer.alloc(32, 1)),
  outputs: [1000, 2000],
  previous: bufferAsHex(Buffer.alloc(32)),
  time: 1700000000,
  transactions: 1,
},
overrides);

const block = makeBlock({});

// The contents of a blocks file kept by the version of the method
const keptFile = blocks => asFile({
  blocks,
  method_version: methodVersion,
  version: 1,
});

const makeFs = ({contents, err}) => ({
  getFile: (path, cbk) => !!err ? cbk(err) : cbk(null, Buffer.from(contents)),
});

const makeArgs = overrides => {
  const args = {
    fs: makeFs({contents: keptFile([block])}),
    method_version: methodVersion,
    path: '/data/blocks.json',
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({fs: undefined}),
    description: 'File system methods are required',
    error: [400, 'ExpectedFileSystemMethodsToGetBlocksFile'],
  },
  {
    args: makeArgs({method_version: undefined}),
    description: 'A method version is required',
    error: [400, 'ExpectedMethodVersionToGetBlocksFile'],
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A path is required',
    error: [400, 'ExpectedPathToGetBlocksFile'],
  },
  {
    args: makeArgs({}),
    description: 'Blocks are read from the file',
    expected: {blocks: [makeBlock({})]},
  },
  {
    args: makeArgs({fs: makeFs({err: {code: 'ENOENT'}})}),
    description: 'A missing file has no blocks',
    expected: {blocks: []},
  },
  {
    args: makeArgs({fs: makeFs({err: {code: 'EACCES'}})}),
    description: 'A file that cannot be read is an error',
    error: [503, 'FailedToReadBlocksFile', {err: {code: 'EACCES'}}],
  },
  {
    args: makeArgs({fs: makeFs({contents: ''})}),
    description: 'An empty file has no blocks',
    expected: {blocks: []},
  },
  {
    args: makeArgs({fs: makeFs({contents: 'not json'})}),
    description: 'A file that is not JSON is an error',
    error: [503, 'FailedToParseBlocksFile'],
  },
  {
    args: makeArgs({
      fs: makeFs({
        contents: asFile({blocks: [block], method_version: methodVersion}),
      }),
    }),
    description: 'A file without a version has no blocks',
    expected: {blocks: []},
  },
  {
    args: makeArgs({method_version: '2.abcdef12'}),
    description: 'A file kept by another version of the method has no blocks',
    expected: {blocks: []},
  },
  {
    args: makeArgs({fs: makeFs({contents: keptFile({})})}),
    description: 'A file without a list of blocks has no blocks',
    expected: {blocks: []},
  },
  {
    args: makeArgs({
      fs: makeFs({
        contents: keptFile([block, makeBlock({height: 101, outputs: [0]})]),
      }),
    }),
    description: 'Only complete blocks are read from the file',
    expected: {blocks: [makeBlock({})]},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await method(args), expected, 'Got expected blocks');
    }

    return;
  });
});
