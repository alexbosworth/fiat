const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const blockHeaderId = require('./../../chain/blocks/block_header_id');
const {makeRawBlock} = require('./../fixtures');
const method = require('./../../chain/blocks/get_block_payments');

const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const previous = bufferAsHex(Buffer.alloc(32, 2));
const time = 1700000000;

// A block with a coinbase and a payment, which pays and returns change
const {block, header} = makeRawBlock({
  previous,
  time,
  transactions: [[312500000], [20000, 30000]],
});

// The payments of the block
const payments = {
  previous,
  time,
  id: blockHeaderId({header}).id,
  outputs: [20000, 30000],
  transactions: 1,
};

// LND that has the block, or fails to get blocks without one
const makeLnd = ({raw}) => ({
  blocks: {
    getBlock: ({}, cbk) => {
      return !raw ? cbk({details: 'err'}) : cbk(null, {raw_block: raw});
    },
    getBlockHash: ({}, cbk) => cbk(null, {block_hash: Buffer.alloc(32)}),
  },
});

const makeArgs = overrides => {
  const args = {height: 1, lnd: makeLnd({raw: hexAsBuffer(block)})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({blocks: {}}),
    description: 'Retrieved blocks are expected to be a map',
    error: [400, 'ExpectedBlocksMapToGetBlockPayments'],
  },
  {
    args: makeArgs({height: undefined}),
    description: 'A block height is required',
    error: [400, 'ExpectedBlockHeightToGetBlockPayments'],
  },
  {
    args: makeArgs({height: -1}),
    description: 'A block height is not negative',
    error: [400, 'ExpectedBlockHeightToGetBlockPayments'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetBlockPayments'],
  },
  {
    args: makeArgs({
      fetched: ({height}) => deepEqual(height, 1, 'Fetched block height'),
    }),
    description: 'The payments of a block are returned',
    expected: payments,
  },
  {
    args: makeArgs({
      blocks: new Map([[1, payments]]),
      fetched: () => {
        throw new Error('UnexpectedFetchOfRetrievedBlock');
      },
      lnd: makeLnd({}),
    }),
    description: 'A block that was already retrieved is not fetched again',
    expected: payments,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await method(args), expected, 'Got expected payments');
    }

    return;
  });
});
