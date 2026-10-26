const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/blocks/get_median_time');

const blockHeaderByteLength = 80;
const timeOffset = 68;

// Block times are set by height, and can be overridden to be out of order
const makeLnd = ({errors, short, times}) => {
  return {
    blocks: {
      getBlockHash: (args, cbk) => {
        const hash = Buffer.alloc(32);

        hash.writeUInt32LE(args.block_height, 0);

        return cbk(null, {block_hash: hash});
      },
      getBlockHeader: (args, cbk) => {
        const height = args.block_hash.readUInt32LE(0);

        if (!!errors) {
          return cbk({details: 'err'});
        }

        if (!!short) {
          return cbk(null, {raw_block_header: Buffer.alloc(1)});
        }

        const header = Buffer.alloc(blockHeaderByteLength);

        const time = (times || {})[height] || height * 600;

        header.writeUInt32LE(time, timeOffset);

        return cbk(null, {raw_block_header: header});
      },
    },
  };
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
    error: [400, 'ExpectedBlockHeightToGetMedianTime'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetMedianTime'],
  },
  {
    args: makeArgs({lnd: makeLnd({errors: true})}),
    description: 'Errors getting block headers are passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingBlockHeader',
      {err: {details: 'err'}},
    ],
  },
  {
    args: makeArgs({lnd: makeLnd({short: true})}),
    description: 'A full block header is expected',
    error: [503, 'ExpectedBlockHeaderToGetMedianTime'],
  },
  {
    args: makeArgs({}),
    description: 'The median time is the time of the sixth block back',
    expected: {time: 95 * 600},
  },
  {
    args: makeArgs({lnd: makeLnd({times: {100: 1, 99: 2, 98: 3}})}),
    description: 'Out of order times do not move the median far',
    expected: {time: 92 * 600},
  },
  {
    args: makeArgs({height: 3}),
    description: 'Near the start of the chain fewer blocks are used',
    expected: {time: 2 * 600},
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

test('Known block times are reused', async () => {
  const times = new Map();

  const lnd = makeLnd({});

  const calls = [];

  const {getBlockHeader} = lnd.blocks;

  lnd.blocks.getBlockHeader = (args, cbk) => {
    calls.push(args);

    return getBlockHeader(args, cbk);
  };

  deepEqual(await method({lnd, times, height: 100}), {time: 95 * 600});
  deepEqual(calls.length, 11, 'Eleven headers are retrieved');
  deepEqual(times.size, 11, 'Eleven times are now known');

  deepEqual(await method({lnd, times, height: 101}), {time: 96 * 600});
  deepEqual(calls.length, 12, 'Only the new header is retrieved');

  return;
});
