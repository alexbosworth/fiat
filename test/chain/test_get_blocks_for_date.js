const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/blocks/get_blocks_for_date');

const blockHeaderByteLength = 80;
const blockInterval = 600;
const date = '2024-01-02';
const dayStart = Date.parse('2024-01-02T00:00:00.000Z') / 1000;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);
const timeOffset = 68;

// Blocks are every ten minutes, with the first block at the start of the day
const genesis = dayStart - 144 * blockInterval;

// The median time past lags the block time by five blocks
const lag = 5;

// Block times are every ten minutes unless overridden
const makeLnd = ({errors, times}) => {
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

        const header = Buffer.alloc(blockHeaderByteLength);

        const time = (times || {})[height] || genesis + height * blockInterval;

        header.writeUInt32LE(time, timeOffset);

        return cbk(null, {raw_block_header: header});
      },
    },
  };
};

const makeArgs = overrides => {
  const args = {date, height: 400, lnd: makeLnd({})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({date: undefined}),
    description: 'A date is required',
    error: [400, 'ExpectedYyyyMmDdDateToGetBlocksForDate'],
  },
  {
    args: makeArgs({date: '2024-1-2'}),
    description: 'A formatted date is required',
    error: [400, 'ExpectedYyyyMmDdDateToGetBlocksForDate'],
  },
  {
    args: makeArgs({date: '2024-13-45'}),
    description: 'A valid date is required',
    error: [400, 'ExpectedValidDateToGetBlocksForDate'],
  },
  {
    args: makeArgs({date: '2024-02-30'}),
    description: 'A date on the calendar is required',
    error: [400, 'ExpectedValidDateToGetBlocksForDate'],
  },
  {
    args: makeArgs({height: undefined}),
    description: 'The current chain height is required',
    error: [400, 'ExpectedCurrentChainHeightToGetBlocksForDate'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetBlocksForDate'],
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
    args: makeArgs({}),
    description: 'The blocks on a day are found by median time past',
    expected: {heights: range(144 + lag, 288 + lag), is_complete: true},
  },
  {
    args: makeArgs({height: 288 + lag + 4}),
    description: 'A day with few blocks after it is not complete',
    expected: {heights: range(144 + lag, 288 + lag), is_complete: false},
  },
  {
    args: makeArgs({height: 288 + lag + 5}),
    description: 'A day with six blocks after it is complete',
    expected: {heights: range(144 + lag, 288 + lag), is_complete: true},
  },
  {
    args: makeArgs({height: 200}),
    description: 'A day that has not ended is not complete',
    expected: {heights: range(144 + lag, 201), is_complete: false},
  },
  {
    args: makeArgs({date: '2024-01-05'}),
    description: 'A day in the future has no blocks',
    expected: {heights: [], is_complete: false},
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        times: {
          148: dayStart + 10,
          149: dayStart - 10,
          292: dayStart + 86400 + 10,
          293: dayStart + 86400 - 10,
        },
      }),
    }),
    description: 'Out of order block times only nudge the day boundaries',
    expected: {heights: range(150, 294), is_complete: true},
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
