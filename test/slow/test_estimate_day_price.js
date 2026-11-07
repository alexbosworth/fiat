const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/estimates/estimate_day_price');

const {abs} = Math;
const centsPerDollar = 100;
const chain = makeChain({});

// The price jumps by eight percent at 11:00 every day
const hourlyMoves = [...Array(24).keys()].map(hour => hour < 11 ? 0 : 0.08);

// Chains with a jump in price, one for an estimate and one for a sample
const makeJumpyChain = () => makeChain({
  hourly_moves: hourlyMoves,
  prices: Array(5).fill(60000),
});

const jumpy = makeJumpyChain();
const jumpySample = makeJumpyChain();

const truth = chain.prices[chain.day_name(1)] * centsPerDollar;

// The day spent more of its time after the jump than before it
const isTimeMedian = cents => abs(cents / 6480000 - 1) < 0.005;

// Most of the windows of a day support its price
const isWindowsSupported = windows => {
  return windows.filter(n => !!n.is_supported).length >= 10;
};

const makeArgs = overrides => {
  const args = {date: chain.day_name(1), height: chain.tip, lnd: chain.lnd};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// Arguments to estimate the price of a day of a chain with a jump in price
const makeJumpyArgs = args => ({
  date: args.jumped.day_name(2),
  height: args.jumped.tip,
  is_sample: args.is_sample,
  lnd: args.jumped.lnd,
  max_price: 72000,
  min_price: 37200,
});

const tests = [
  {
    args: makeArgs({}),
    description: 'The price of a day is estimated from all of its blocks',
    expected: {
      blocks: [149, 292],
      has_confidence: true,
      has_outputs: true,
      has_payments: true,
      has_spikes: true,
      id_length: 64,
      is_close: true,
      is_supported: true,
      is_widened: undefined,
      sample_blocks: undefined,
    },
    measure: res => ({
      blocks: res.blocks,
      has_confidence: res.confidence > 0,
      has_outputs: res.outputs > 0,
      has_payments: res.payments > 0,
      has_spikes: res.spikes.length > 0,
      id_length: res.block_id.length,
      is_close: abs(res.cents / truth - 1) < 0.01,
      is_supported: res.is_supported,
      is_widened: res.is_widened,
      sample_blocks: res.sample_blocks,
    }),
  },
  {
    args: makeJumpyArgs({is_sample: false, jumped: jumpy}),
    description: 'A day the price jumped in is priced from its windows',
    expected: {
      fetched: 144,
      is_supported: true,
      is_time_median: true,
      is_windows_supported: true,
      windows: 12,
    },
    measure: res => ({
      fetched: jumpy.calls.blocks,
      is_supported: res.is_supported,
      is_time_median: isTimeMedian(res.cents),
      is_windows_supported: isWindowsSupported(res.windows),
      windows: res.windows.length,
    }),
  },
  {
    args: makeJumpyArgs({is_sample: true, jumped: jumpySample}),
    description: 'A sample of a jumpy day is priced from its windows',
    expected: {
      fetched: 144,
      is_supported: true,
      is_time_median: true,
      is_windows_supported: true,
      windows: 12,
    },
    measure: res => ({
      fetched: jumpySample.calls.blocks,
      is_supported: res.is_supported,
      is_time_median: isTimeMedian(res.cents),
      is_windows_supported: isWindowsSupported(res.windows),
      windows: res.windows.length,
    }),
  },
  {
    args: makeArgs({}),
    description: 'A full day with a steady price is priced from its windows',
    expected: {is_close: true, is_windowed: true},
    measure: res => ({
      is_close: abs(res.cents / truth - 1) < 0.01,
      is_windowed: res.windows.length > 10,
    }),
  },
  {
    args: makeArgs({is_sample: true}),
    description: 'A supported sample only bridges, so it is not windowed',
    expected: {windows: undefined},
    measure: res => ({windows: res.windows}),
  },
];

tests.forEach(({args, description, expected, measure}) => {
  return test(description, async () => {
    deepEqual(measure(await method(args)), expected, 'Got expected estimate');

    return;
  });
});
