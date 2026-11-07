const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/blocks/get_median_time');

const blockHeaderByteLength = 80;
const timeOffset = 68;

// Block times are set by height, and can be overridden to be out of order
const makeLnd = ({errors, short, times}) => {
  const headers = [];

  return {
    headers,
    blocks: {
      getBlockHash: (args, cbk) => {
        const hash = Buffer.alloc(32);

        hash.writeUInt32LE(args.block_height, 0);

        return cbk(null, {block_hash: hash});
      },
      getBlockHeader: (args, cbk) => {
        const height = args.block_hash.readUInt32LE(0);

        headers.push(height);

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

// Block times known for heights up to a height
const timesUpTo = height => new Map([...Array(11).keys()].map(n => {
  return [height - n, (height - n) * 600];
}));

// Get a median time, with the headers it took and the block times known after
const medianTime = async args => {
  const {time} = await method(args);

  // Exit early when there are no known block times to add to
  if (!args.times) {
    return {time, headers: args.lnd.headers.length};
  }

  return {time, headers: args.lnd.headers.length, known: args.times.size};
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
    expected: {headers: 11, time: 95 * 600},
  },
  {
    args: makeArgs({lnd: makeLnd({times: {100: 1, 99: 2, 98: 3}})}),
    description: 'Out of order times do not move the median far',
    expected: {headers: 11, time: 92 * 600},
  },
  {
    args: makeArgs({height: 3}),
    description: 'Near the start of the chain fewer blocks are used',
    expected: {headers: 4, time: 2 * 600},
  },
  {
    args: makeArgs({times: new Map()}),
    description: 'Block times are kept as they are found',
    expected: {headers: 11, known: 11, time: 95 * 600},
  },
  {
    args: makeArgs({height: 101, times: timesUpTo(100)}),
    description: 'Known block times are reused',
    expected: {headers: 1, known: 12, time: 96 * 600},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await medianTime(args), expected, 'Got expected result');
    }

    return;
  });
});
