const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const blockHeaderId = require('./../../chain/blocks/block_header_id');
const {blocksFileVersion} = require('./../../storage/constants');
const headerPrevious = require('./../../chain/blocks/block_header_previous');
const {makeFs} = require('./../fixtures');
const method = require('./../../chain/estimates/get_kept_blocks');
const {methodVersion} = require('./../../chain/known');

const blocksPath = '/data/blocks.json';
const bufferAsHex = buffer => buffer.toString('hex');
const headerByteLength = 80;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const previousOffset = 4;
const timeOffset = 68;

// Make headers that each link back to the header before them, a shift in the
// times of the headers makes the headers of another chain
const makeHeaders = ({shift}) => {
  return [...Array(10).keys()].map(n => n + 98).reduce((headers, height) => {
    const header = Buffer.alloc(headerByteLength);
    const previous = headers[height - 1];

    if (!!previous) {
      const {id} = blockHeaderId({header: previous});

      hexAsBuffer(id).reverse().copy(header, previousOffset);
    }

    header.writeUInt32LE(height + shift, timeOffset);

    headers[height] = bufferAsHex(header);

    return headers;
  },
  {});
};

const chain = makeHeaders({shift: 0});
const other = makeHeaders({shift: 1});

// Kept blocks made from the headers at heights
const kept = ({headers, heights}) => heights.map(height => ({
  height,
  id: blockHeaderId({header: headers[height]}).id,
  outputs: [1000],
  previous: headerPrevious({header: headers[height]}).previous,
  time: height,
  transactions: 1,
}));

// Kept blocks by their heights
const asMap = blocks => new Map(blocks.map(block => [block.height, block]));

// Blocks by their heights as they are kept once fetched, without a height
const asFetched = blocks => new Map(blocks.map(block => [block.height, {
  id: block.id,
  outputs: block.outputs,
  previous: block.previous,
  time: block.time,
  transactions: block.transactions,
}]));

// The contents of a blocks file with blocks in it
const asFile = blocks => JSON.stringify({
  blocks,
  method_version: methodVersion({}).version,
  version: blocksFileVersion,
});

// LND that fails to get block headers
const failingLnd = {
  blocks: {
    getBlockHash: (req, cbk) => cbk(null, {block_hash: Buffer.alloc(32)}),
    getBlockHeader: (req, cbk) => cbk({details: 'err'}),
  },
};

// LND that has headers at heights
const makeLnd = ({headers}) => ({
  blocks: {
    getBlockHash: (req, cbk) => {
      const id = Buffer.alloc(32);

      id.writeUInt32LE(req.block_height);

      return cbk(null, {block_hash: id});
    },
    getBlockHeader: (req, cbk) => {
      const header = headers[req.block_hash.readUInt32LE()];

      return cbk(null, {raw_block_header: hexAsBuffer(header)});
    },
  },
});

// A logger that keeps the lines logged to it
const makeLogger = () => {
  const logged = [];

  return {logged, error: line => logged.push(line)};
};

const makeArgs = overrides => {
  const args = {
    fs: makeFs({files: {}}),
    height: 105,
    kept: {},
    lnd: makeLnd({headers: chain}),
    logger: makeLogger(),
    path: blocksPath,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({fs: undefined}),
    description: 'File system methods are required',
    error: [400, 'ExpectedFileSystemMethodsToGetKeptBlocks'],
  },
  {
    args: makeArgs({height: undefined}),
    description: 'The current chain height is required',
    error: [400, 'ExpectedCurrentChainHeightToGetKeptBlocks'],
  },
  {
    args: makeArgs({kept: undefined}),
    description: 'Kept blocks are required',
    error: [400, 'ExpectedKeptBlocksObjectToGetKeptBlocks'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetKeptBlocks'],
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A blocks file path is required',
    error: [400, 'ExpectedBlocksFilePathToGetKeptBlocks'],
  },
  {
    args: makeArgs({}),
    description: 'There are no kept blocks without a blocks file',
    expected: {blocks: new Map(), logged: [], saved: new Set()},
  },
  {
    args: makeArgs({
      fs: makeFs({
        files: {
          [blocksPath]: asFile(kept({
            headers: chain,
            heights: [100, 101, 102, 103, 104, 105],
          })),
        },
      }),
    }),
    description: 'Blocks are read from the blocks file the first time',
    expected: {
      blocks: asMap(kept({
        headers: chain,
        heights: [105, 104, 103, 102, 101, 100],
      })),
      logged: [],
      saved: new Set([100, 101, 102, 103, 104, 105]),
    },
  },
  {
    args: makeArgs({
      fs: makeFs({
        files: {
          [blocksPath]: JSON.stringify({
            blocks: kept({headers: chain, heights: [104, 105]}),
            method_version: 'other',
            version: blocksFileVersion,
          }),
        },
      }),
    }),
    description: 'Blocks kept by another version of the method are not read',
    expected: {blocks: new Map(), logged: [], saved: new Set()},
  },
  {
    args: makeArgs({fs: {getFile: (file, cbk) => cbk({code: 'EACCES'})}}),
    description: 'A blocks file that cannot be read is logged and passed over',
    expected: {
      blocks: new Map(),
      logged: [{
        failed_to_read_kept_blocks: {
          err: [503, 'FailedToReadBlocksFile', {err: {code: 'EACCES'}}],
          path: blocksPath,
        },
      }],
      saved: new Set(),
    },
  },
  {
    args: makeArgs({
      fs: makeFs({
        files: {[blocksPath]: asFile(kept({headers: chain, heights: [105]}))},
      }),
      lnd: failingLnd,
    }),
    description: 'A failure to check the kept blocks is passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingBlockHeader',
      {err: {details: 'err'}},
    ],
  },
  {
    args: makeArgs({
      kept: {
        blocks: asFetched(kept({
          headers: chain,
          heights: [105, 104, 102, 101, 100],
        })),
        saved: new Set([104, 102, 101, 100]),
        saves: {push: () => {}},
      },
      lnd: makeLnd({headers: Object.assign({}, chain, {105: other[105]})}),
    }),
    description: 'Kept blocks are checked again before they are used again',
    expected: {
      blocks: asMap(kept({headers: chain, heights: [102, 101, 100]})),
      logged: [],
      saved: new Set([102, 101, 100]),
    },
  },
  {
    args: makeArgs({
      height: 600,
      kept: {
        blocks: asMap(kept({headers: chain, heights: [101, 100]})),
        saved: new Set([101, 100]),
      },
    }),
    description: 'Kept blocks that are no longer recent are let go',
    expected: {blocks: new Map(), logged: [], saved: new Set()},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const {blocks} = await method(args);

      const got = {blocks, logged: args.logger.logged, saved: args.kept.saved};

      deepEqual(got, expected, 'Got kept blocks');
    }

    return;
  });
});
