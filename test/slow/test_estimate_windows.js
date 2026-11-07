const {deepEqual} = require('node:assert').strict;
const {isDeepStrictEqual} = require('util');
const test = require('node:test');

const estimateWindows = require('./../../chain/estimates/estimate_windows');
const {getBlocksForDate} = require('./../../chain/blocks');
const {makeChain} = require('./../fixtures');

const after = 64800;
const before = 60000;
const centsPerDollar = 100;
const secondsPerDay = 60 * 60 * 24;

// The price jumps by eight percent at 11:00 every day
const hourlyMoves = [...Array(24).keys()].map(hour => hour < 11 ? 0 : 0.08);

const chain = makeChain({
  hourly_moves: hourlyMoves,
  prices: Array(5).fill(before),
  quiet_days: [3],
});

const isNear = (cents, price) => Math.abs(cents / centsPerDollar / price - 1);

const secondsIn = windows => windows.reduce((sum, n) => sum + n.seconds, 0);

// Estimate the windows of a day of the chain with LND for a chain
const estimateDay = async args => {
  const {heights} = await getBlocksForDate({
    date: chain.day_name(args.day),
    height: chain.tip,
    lnd: chain.lnd,
  });

  return estimateWindows({
    heights,
    blocks: args.blocks || new Map(),
    lnd: args.lnd || chain.lnd,
    max_price: args.max_price,
    min_price: args.min_price,
    times: new Map(),
  });
};

const tests = [
  {
    args: {day: 2, max_price: 72000, min_price: 37200},
    description: 'A day the price jumped in is priced from its windows',
    expected: {
      is_each_near: true,
      is_mostly_supported: true,
      is_outputs_counted: true,
      is_payments_counted: true,
      is_significant: true,
      is_supported: true,
      is_time_median: true,
      seconds: secondsPerDay,
      windows: 12,
    },
    method: async args => {
      const res = await estimateDay(args);

      const supported = res.windows.filter(n => n.is_supported);

      // A window is priced before or after the jump
      const isEachNear = supported.every(({cents}) => {
        return Math.min(isNear(cents, before), isNear(cents, after)) < 0.01;
      });

      return {
        is_each_near: isEachNear,
        is_mostly_supported: supported.length >= 10,
        is_outputs_counted: res.outputs > res.payments,
        is_payments_counted: res.payments > supported.length * 100,
        is_significant: res.significance > 4,
        is_supported: res.is_supported,

        // The day spent more of its time after the jump than before it
        is_time_median: isNear(res.cents, after) < 0.005,
        seconds: secondsIn(res.windows),
        windows: res.windows.length,
      };
    },
  },
  {
    args: {day: 2, max_price: 72000, min_price: 37200},
    description: 'Retrieved blocks are not fetched again and give the same',
    expected: {fetched: 0, is_same: true},
    method: async args => {
      const blocks = new Map();

      const first = await estimateDay(Object.assign({blocks}, args));

      const fetched = chain.calls.blocks;

      const again = await estimateDay(Object.assign({blocks}, args));

      return {
        fetched: chain.calls.blocks - fetched,
        is_same: isDeepStrictEqual(again, first),
      };
    },
  },
  {
    args: {day: 2, max_price: 72000, min_price: 37200},
    description: 'Time is counted once when block times go backwards',
    expected: {
      fourth: 60 * 60 * 2,
      seconds: secondsPerDay,
      third: 60 * 60 * 2,
    },
    method: async args => {
      const {heights} = await getBlocksForDate({
        date: chain.day_name(args.day),
        height: chain.tip,
        lnd: chain.lnd,
      });

      // The block that ends the third window is stamped three hours ahead, so
      // the block that ends the fourth window appears to come before it
      const [ahead] = heights.slice(35, 36);

      const shifted = makeChain({
        hourly_moves: hourlyMoves,
        prices: Array(5).fill(before),
        quiet_days: [3],
        time_shifts: {[ahead]: 60 * 60 * 3},
      });

      const {windows} = await estimateDay(Object.assign({}, args, {
        lnd: shifted.lnd,
      }));

      return {
        fourth: windows[3].seconds,
        seconds: secondsIn(windows),
        third: windows[2].seconds,
      };
    },
  },
  {
    args: {day: 2, max_price: 62000, min_price: 38440},
    description: 'Windows found outside the price window are not counted',
    expected: {cents: undefined, is_mostly_widened: true, is_supported: false},
    method: async args => {
      const res = await estimateDay(args);

      // Windows after the jump are above the window and are widened
      const widened = res.windows.filter(n => !!n.is_widened);

      return {
        cents: res.cents,
        is_mostly_widened: widened.length >= 5,
        is_supported: res.is_supported,
      };
    },
  },
  {
    args: {day: 3, max_price: 72000, min_price: 37200},
    description: 'A day without round payments has no supported windows',
    expected: {is_supported: false, is_unsupported: true, windows: 12},
    method: async args => {
      const res = await estimateDay(args);

      const supported = res.windows.filter(n => n.is_supported);

      return {
        is_supported: res.is_supported,

        // Only the window that reaches into the next day can be supported
        is_unsupported: supported.length <= 1,
        windows: res.windows.length,
      };
    },
  },
];

tests.forEach(({args, description, expected, method}) => {
  return test(description, async () => {
    deepEqual(await method(args), expected, 'Got expected windows');

    return;
  });
});
