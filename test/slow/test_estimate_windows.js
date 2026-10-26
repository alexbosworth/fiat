const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');

const {getBlocksForDate} = require('./../../chain/blocks');
const {makeChain} = require('./../fixtures');
const method = require('./../../chain/estimates/estimate_windows');

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

test('A day the price jumped in is priced from its windows', async () => {
  const {heights} = await getBlocksForDate({
    date: chain.day_name(2),
    height: chain.tip,
    lnd: chain.lnd,
  });

  const blocks = new Map();

  const res = await method({
    blocks,
    heights,
    lnd: chain.lnd,
    max_price: 72000,
    min_price: 37200,
    times: new Map(),
  });

  const supported = res.windows.filter(n => n.is_supported);

  const covered = res.windows.reduce((sum, n) => sum + n.seconds, 0);

  deepEqual(res.windows.length, 12, 'The day is split into windows');
  deepEqual(covered, secondsPerDay, 'The windows cover the whole day');
  ok(supported.length >= 10, 'Most windows are supported');

  supported.forEach(({cents}) => {
    const near = Math.min(isNear(cents, before), isNear(cents, after));

    ok(near < 0.01, 'A window is priced before or after the jump');

    return;
  });

  // The day spent more of its time after the jump than before it
  ok(isNear(res.cents, after) < 0.005, 'The price is the time median');
  deepEqual(res.is_supported, true, 'The windows support the price');
  ok(res.payments > supported.length * 100, 'Window payments are counted');
  ok(res.outputs > res.payments, 'Window outputs are counted');
  ok(res.significance > 4, 'The measures of the median window are given');

  const fetched = chain.calls.blocks;

  const again = await method({
    blocks,
    heights,
    lnd: chain.lnd,
    max_price: 72000,
    min_price: 37200,
    times: new Map(),
  });

  deepEqual(chain.calls.blocks, fetched, 'Retrieved blocks are not refetched');
  deepEqual(again, res, 'The same windows give the same price');

  return;
});

test('Time is counted once when block times go backwards', async () => {
  const {heights} = await getBlocksForDate({
    date: chain.day_name(2),
    height: chain.tip,
    lnd: chain.lnd,
  });

  // The block that ends the third window is stamped three hours ahead, so the
  // block that ends the fourth window appears to come before it
  const [ahead] = heights.slice(35, 36);

  const shifted = makeChain({
    hourly_moves: hourlyMoves,
    prices: Array(5).fill(before),
    quiet_days: [3],
    time_shifts: {[ahead]: 60 * 60 * 3},
  });

  const res = await method({
    heights,
    blocks: new Map(),
    lnd: shifted.lnd,
    max_price: 72000,
    min_price: 37200,
    times: new Map(),
  });

  const covered = res.windows.reduce((sum, n) => sum + n.seconds, 0);

  deepEqual(covered, secondsPerDay, 'Each second is counted once');
  deepEqual(res.windows[2].seconds, 60 * 60 * 2, 'The window ahead is 2h');
  deepEqual(res.windows[3].seconds, 60 * 60 * 2, 'So is the window after it');

  return;
});

test('Windows found outside the price window are not counted', async () => {
  const {heights} = await getBlocksForDate({
    date: chain.day_name(2),
    height: chain.tip,
    lnd: chain.lnd,
  });

  // The window is below the price after the jump
  const res = await method({
    heights,
    blocks: new Map(),
    lnd: chain.lnd,
    max_price: 62000,
    min_price: 38440,
    times: new Map(),
  });

  const widened = res.windows.filter(n => !!n.is_widened);

  ok(widened.length >= 5, 'Windows after the jump are widened');
  deepEqual(res.is_supported, false, 'Windows before do not cover half');
  deepEqual(res.cents, undefined, 'No price is given');

  return;
});

test('A day without round payments has no supported windows', async () => {
  const {heights} = await getBlocksForDate({
    date: chain.day_name(3),
    height: chain.tip,
    lnd: chain.lnd,
  });

  const res = await method({
    heights,
    blocks: new Map(),
    lnd: chain.lnd,
    max_price: 72000,
    min_price: 37200,
    times: new Map(),
  });

  const supported = res.windows.filter(n => n.is_supported);

  // The last window reaches into the next day, which has round payments
  ok(supported.length <= 1, 'Only the window into the next day is supported');
  deepEqual(res.is_supported, false, 'The windows do not support a price');
  deepEqual(res.windows.length, 12, 'All the windows are reported');

  return;
});
