const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/estimates/estimate_day_price');

const centsPerDollar = 100;
const chain = makeChain({});

const makeArgs = overrides => {
  const args = {date: chain.day_name(1), height: chain.tip, lnd: chain.lnd};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

test('The price of a day is estimated from all of its blocks', async () => {
  const res = await method(makeArgs({}));

  const truth = chain.prices[chain.day_name(1)] * centsPerDollar;

  deepEqual(res.blocks, [149, 292], 'Block range is returned');
  ok(Math.abs(res.cents / truth - 1) < 0.01, 'Price is close to truth');
  ok(res.confidence > 0, 'Confidence is returned');
  ok(res.outputs > 0, 'Outputs count is returned');
  ok(res.payments > 0, 'Payments count is returned');
  ok(res.spikes.length > 0, 'Spike strengths are returned');
  deepEqual(res.hash.length, 64, 'Last block hash is returned');
  deepEqual(res.is_supported, true, 'Estimate is supported');
  deepEqual(res.is_widened, undefined, 'Search was not widened');
  deepEqual(res.sample_blocks, undefined, 'The day is not a sample');

  return;
});

test('A day the price jumped in is priced from its windows', async () => {
  // The price jumps by eight percent at 11:00 every day
  const hourlyMoves = [...Array(24).keys()].map(hour => hour < 11 ? 0 : 0.08);

  const jumpy = makeChain({
    hourly_moves: hourlyMoves,
    prices: Array(5).fill(60000),
  });

  const args = {
    date: jumpy.day_name(2),
    height: jumpy.tip,
    lnd: jumpy.lnd,
    max_price: 72000,
    min_price: 37200,
  };

  for (const isSample of [false, true]) {
    const fetched = jumpy.calls.blocks;

    const res = await method(Object.assign({is_sample: isSample}, args));

    const supported = res.windows.filter(n => !!n.is_supported);

    // The day spent more of its time after the jump than before it
    ok(Math.abs(res.cents / 6480000 - 1) < 0.005, 'Price is the time median');
    deepEqual(res.is_supported, true, 'The windows support the price');
    deepEqual(res.windows.length, 12, 'The day is split into windows');
    ok(supported.length >= 10, 'The windows are supported');
    deepEqual(jumpy.calls.blocks - fetched, 144, 'Blocks are fetched once');
  }

  // A full day with a steady price is priced from its windows too
  const steady = await method(makeArgs({}));

  const truth = chain.prices[chain.day_name(1)] * centsPerDollar;

  ok(Math.abs(steady.cents / truth - 1) < 0.01, 'The steady price is found');
  ok(steady.windows.length > 10, 'A full day is split into windows');

  // A supported sample only bridges, so it is not split into windows
  const sample = await method(makeArgs({is_sample: true}));

  deepEqual(sample.windows, undefined, 'A supported sample is not split');

  return;
});
