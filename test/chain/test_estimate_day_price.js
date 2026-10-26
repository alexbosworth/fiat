const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/estimates/estimate_day_price');

const centsPerDollar = 100;
const chain = makeChain({});
const sparse = makeChain({payments_per_block: 5});

const makeArgs = overrides => {
  const args = {date: chain.day_name(1), height: chain.tip, lnd: chain.lnd};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({date: undefined}),
    description: 'A date is required',
    error: [400, 'ExpectedYyyyMmDdDateToEstimateDayPrice'],
  },
  {
    args: makeArgs({height: undefined}),
    description: 'The current chain height is required',
    error: [400, 'ExpectedCurrentChainHeightToEstimateDayPrice'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToEstimateDayPrice'],
  },
  {
    args: makeArgs({date: chain.day_name(4)}),
    description: 'A complete day is required',
    error: [503, 'ExpectedCompleteDayToEstimateDayPrice'],
  },
  {
    args: makeArgs({is_sample: true}),
    description: 'The price of a day is estimated from a sample of blocks',
    expected: {
      blocks: [149, 292],
      day: chain.day_name(1),
      is_sample: true,
      sample_blocks: 24,
    },
  },
  {
    args: makeArgs({
      is_sample: true,
      lnd: sparse.lnd,
      max_price: 60000,
      min_price: 30000,
    }),
    description: 'A sample with few round payments is expanded',
    expected: {
      blocks: [149, 292],
      day: chain.day_name(1),
      is_expanded: true,
      is_sample: true,
      sample_blocks: 144,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');

      return;
    }

    const fetched = chain.calls.blocks;

    const res = await method(args);

    const truth = chain.prices[expected.day] * centsPerDollar;

    deepEqual(res.blocks, expected.blocks, 'Block range is returned');
    ok(Math.abs(res.cents / truth - 1) < 0.01, 'Price is close to truth');
    ok(res.confidence > 0, 'Confidence is returned');
    ok(res.outputs > 0, 'Outputs count is returned');
    ok(res.payments > 0, 'Payments count is returned');
    ok(res.spikes.length > 0, 'Spike strengths are returned');
    deepEqual(res.hash.length, 64, 'Last block hash is returned');
    deepEqual(res.is_supported, true, 'Estimate is supported');
    deepEqual(res.is_widened, undefined, 'Search was not widened');
    deepEqual(res.sample_blocks, expected.sample_blocks, 'Sample is counted');

    if (!!expected.is_expanded) {
      deepEqual(sparse.calls.blocks, 144, 'The sample is expanded to all');
    } else if (!!expected.is_sample) {
      deepEqual(chain.calls.blocks - fetched, 24, 'Blocks are fetched once');
    }

    return;
  });
});
