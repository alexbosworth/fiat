const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/blocks/get_block_header');

const bufferAsHex = buffer => buffer.toString('hex');
const header = Buffer.alloc(80, 1);

const makeLnd = overrides => {
  const lnd = {
    blocks: {
      getBlockHash: ({}, cbk) => cbk(null, {block_hash: Buffer.alloc(32)}),
      getBlockHeader: ({}, cbk) => cbk(null, {raw_block_header: header}),
    },
  };

  Object.keys(overrides).forEach(k => lnd.blocks[k] = overrides[k]);

  return lnd;
};

const makeArgs = overrides => {
  const args = {height: 100, lnd: makeLnd({})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({height: undefined}),
    description: 'A block height is required',
    error: [400, 'ExpectedBlockHeightToGetBlockHeader'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetBlockHeader'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({getBlockHeader: ({}, cbk) => cbk({details: 'err'})}),
    }),
    description: 'Errors getting the block header are passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingBlockHeader',
      {err: {details: 'err'}},
    ],
  },
  {
    args: makeArgs({}),
    description: 'The block header is retrieved',
    expected: {header: bufferAsHex(header)},
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
