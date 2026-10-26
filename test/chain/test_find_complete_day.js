const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/blocks/find_complete_day');

const chain = makeChain({});

const makeArgs = overrides => {
  const args = {height: chain.tip, lnd: chain.lnd};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({height: undefined}),
    description: 'The current chain height is required',
    error: [400, 'ExpectedCurrentChainHeightToFindCompleteDay'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToFindCompleteDay'],
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
    description: 'A full chain tip block header is expected',
    error: [503, 'ExpectedBlockHeaderToGetMedianTime'],
  },
  {
    args: makeArgs({height: 10}),
    description: 'A complete day must exist before the chain tip',
    error: [503, 'FailedToFindCompleteDayBeforeChainTip'],
  },
  {
    args: makeArgs({}),
    description: 'The latest complete day is found',
    expected: {day: chain.day_name(3)},
  },
  {
    args: makeArgs({height: 4 * 144 + 2}),
    description: 'A day with too few blocks after it is skipped',
    expected: {day: chain.day_name(2)},
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
