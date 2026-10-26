const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/estimates/estimate_windows');

const before = 60000;

// The price jumps by eight percent at 11:00 every day
const hourlyMoves = [...Array(24).keys()].map(hour => hour < 11 ? 0 : 0.08);

const chain = makeChain({
  hourly_moves: hourlyMoves,
  prices: Array(5).fill(before),
  quiet_days: [3],
});

const makeArgs = overrides => {
  const args = {
    blocks: new Map(),
    heights: [1, 2, 3],
    lnd: chain.lnd,
    times: new Map(),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({blocks: undefined}),
    description: 'A map of retrieved blocks is required',
    error: [400, 'ExpectedRetrievedBlocksMapToEstimateWindows'],
  },
  {
    args: makeArgs({heights: []}),
    description: 'Block heights are required',
    error: [400, 'ExpectedBlockHeightsToEstimateWindows'],
  },
  {
    args: makeArgs({heights: ['height']}),
    description: 'Numeric block heights are required',
    error: [400, 'ExpectedBlockHeightNumbersToEstimateWindows'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToEstimateWindows'],
  },
  {
    args: makeArgs({times: undefined}),
    description: 'A map of block times is required',
    error: [400, 'ExpectedBlockTimesMapToEstimateWindows'],
  },
];

tests.forEach(({args, description, error}) => {
  return test(description, async () => {
    await rejects(method(args), error, 'Got expected error');

    return;
  });
});
