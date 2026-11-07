const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const blockHeaderId = require('./../../chain/blocks/block_header_id');
const headerPrevious = require('./../../chain/blocks/block_header_previous');
const method = require('./../../chain/blocks/check_kept_blocks');

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

      if (!header) {
        return cbk({details: 'err'});
      }

      return cbk(null, {raw_block_header: hexAsBuffer(header)});
    },
  },
});

const makeArgs = overrides => {
  const args = {
    blocks: kept({headers: chain, heights: [105, 104, 103, 102, 101, 100]}),
    floor: 100,
    height: 105,
    lnd: makeLnd({headers: chain}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({blocks: undefined}),
    description: 'Blocks are required',
    error: [400, 'ExpectedBlocksToCheckKeptBlocks'],
  },
  {
    args: makeArgs({floor: undefined}),
    description: 'A lowest height to keep is required',
    error: [400, 'ExpectedLowestHeightToCheckKeptBlocks'],
  },
  {
    args: makeArgs({height: undefined}),
    description: 'The current chain height is required',
    error: [400, 'ExpectedCurrentChainHeightToCheckKeptBlocks'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToCheckKeptBlocks'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({headers: Object.assign({}, other, {105: chain[105]})}),
    }),
    description: 'Linked blocks are checked by only their highest block',
    expected: {
      blocks: kept({headers: chain, heights: [105, 104, 103, 102, 101, 100]}),
    },
  },
  {
    args: makeArgs({
      blocks: kept({headers: chain, heights: [106, 105, 104, 101, 100, 99]}),
      height: 104,
    }),
    description: 'Blocks below the lowest height or above the tip are let go',
    expected: {blocks: kept({headers: chain, heights: [104, 101, 100]})},
  },
  {
    args: makeArgs({
      blocks: kept({headers: chain, heights: [105, 104, 101, 100]}),
      lnd: makeLnd({headers: Object.assign({}, chain, {101: other[101]})}),
    }),
    description: 'Runs of blocks with a gap between them are checked apart',
    expected: {blocks: kept({headers: chain, heights: [105, 104]})},
  },
  {
    args: makeArgs({
      blocks: [].concat(
        kept({headers: chain, heights: [103]}),
        kept({headers: other, heights: [102]}),
        kept({headers: chain, heights: [101, 100]})
      ),
      height: 103,
    }),
    description: 'A block that the chain replaced is not kept',
    expected: {blocks: kept({headers: chain, heights: [103, 101, 100]})},
  },
  {
    args: makeArgs({
      blocks: [].concat(
        kept({headers: other, heights: [103, 102]}),
        kept({headers: chain, heights: [101, 100]})
      ),
      height: 103,
    }),
    description: 'A run of blocks that the chain replaced is not kept',
    expected: {blocks: kept({headers: chain, heights: [101, 100]})},
  },
  {
    args: makeArgs({
      lnd: makeLnd({headers: Object.assign({}, chain, {105: undefined})}),
    }),
    description: 'A failure to look up a block in the chain is passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingBlockHeader',
      {err: {details: 'err'}},
    ],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await method(args), expected, 'Got expected kept blocks');
    }

    return;
  });
});
