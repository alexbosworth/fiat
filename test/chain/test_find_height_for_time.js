const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/blocks/find_height_for_time');

const chain = makeChain({});
const dayStart = Date.parse('2024-01-02T00:00:00.000Z') / 1000;

const makeArgs = overrides => {
  const args = {height: chain.tip, lnd: chain.lnd, low: 0, time: dayStart};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({height: undefined}),
    description: 'The current chain height is required',
    error: [400, 'ExpectedCurrentChainHeightToFindHeightForTime'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToFindHeightForTime'],
  },
  {
    args: makeArgs({low: undefined}),
    description: 'A lowest height is required',
    error: [400, 'ExpectedLowestHeightToFindHeightForTime'],
  },
  {
    args: makeArgs({time: undefined}),
    description: 'A time is required',
    error: [400, 'ExpectedTimeToFindHeightForTime'],
  },
  {
    args: makeArgs({
      lnd: {
        blocks: {
          getBlockHash: ({}, cbk) => cbk(null, {block_hash: Buffer.alloc(32)}),
          getBlockHeader: ({}, cbk) => {
            return cbk(null, {raw_block_header: Buffer.alloc(1)});
          },
        },
      },
    }),
    description: 'A full block header is expected',
    error: [503, 'ExpectedBlockHeaderToGetMedianTime'],
  },
  {
    args: makeArgs({}),
    description: 'The crossing heights are found by median time past',
    expected: {at_or_after: 149, before: 148},
  },
  {
    args: makeArgs({time: dayStart + 10 * 86400}),
    description: 'A time after all blocks is after the chain tip',
    expected: {at_or_after: chain.tip + 1, before: chain.tip},
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
