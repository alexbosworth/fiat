const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/blocks/get_block_hash');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');

// The genesis block header
const genesisHeader = [
  '0100000000000000000000000000000000000000000000000000000000000000',
  '000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa',
  '4b1e5e4a29ab5f49ffff001d1dac2b7c',
].join('');

const genesisHash = [
  '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
].join('');

const makeLnd = ({header}) => {
  return {
    blocks: {
      getBlockHash: ({}, cbk) => cbk(null, {block_hash: Buffer.alloc(32)}),
      getBlockHeader: ({}, cbk) => {
        return cbk(null, {raw_block_header: hexAsBuffer(header)});
      },
    },
  };
};

const makeArgs = overrides => {
  const args = {height: 0, lnd: makeLnd({header: genesisHeader})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({height: undefined}),
    description: 'A block height is required',
    error: [400, 'ExpectedBlockHeightToGetBlockHash'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetBlockHash'],
  },
  {
    args: makeArgs({
      lnd: {
        blocks: {
          getBlockHash: ({}, cbk) => cbk(null, {block_hash: Buffer.alloc(32)}),
          getBlockHeader: ({}, cbk) => cbk({details: 'err'}),
        },
      },
    }),
    description: 'Errors getting the block header are passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingBlockHeader',
      {err: {details: 'err'}},
    ],
  },
  {
    args: makeArgs({lnd: makeLnd({header: '00'})}),
    description: 'A full block header is expected',
    error: [503, 'ExpectedBlockHeaderToGetBlockHash'],
  },
  {
    args: makeArgs({}),
    description: 'The block hash is derived from the header',
    expected: {hash: genesisHash},
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
