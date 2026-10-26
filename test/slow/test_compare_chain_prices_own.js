const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const {ok} = require('node:assert').strict;
const test = require('node:test');

const {makeRecentChain} = require('./../fixtures');
const {makeReferenceRequest} = require('./../fixtures');
const method = require('./../../scripts/compare/compare_chain_prices');

// The pauses between reference requests pass at once
mock.timers.enable({apis: ['setTimeout']});

// Reference providers trading all day at the price of the chain on a day
const makeRequest = (chain, options) => {
  return makeReferenceRequest(Object.assign({chain}, options, {
    timers: mock.timers,
  }));
};

test('Dates are estimated on their own when unguided', async () => {
  const chain = makeRecentChain({quiet_days: [2]});
  const logs = [];

  const dates = [chain.day_name(1), chain.day_name(2), chain.day_name(3)];

  const res = await method({
    dates,
    is_unguided: true,
    lnd: chain.lnd,
    logger: {info: log => logs.push(log)},
    request: makeRequest(chain),
  });

  const [first, quiet, third] = res.comparisons;

  deepEqual(res.records.map(n => n.date), dates, 'One record per date');
  deepEqual(res.records.map(n => n.is_supported), [true, false, true], 'Sup');
  deepEqual(res.records.some(n => !!n.is_sample), false, 'No bridging');
  deepEqual(first.is_supported, true, 'A day with payments is supported');
  deepEqual(quiet.is_supported, false, 'A quiet day is not supported');
  deepEqual(third.is_supported, true, 'Days are estimated independently');
  ok(quiet.cents > 0, 'The unsupported estimate is still reported');
  ok(quiet.difference !== undefined, 'And compared with the reference');
  ok(Math.abs(third.cents / (chain.prices[third.date] * 100) - 1) < 0.02);

  const compared = logs.filter(n => !!n.compared).map(n => n.compared);

  deepEqual(compared.map(n => n.is_unsupported), [undefined, true, undefined]);
  deepEqual(compared.map(n => n.payments > 0), [true, true, true], 'Count');
  deepEqual(logs.filter(n => !!n.chain_price).length, 0, 'No bridging logs');

  return;
});

test('Own block estimates can cap values just off round amounts', async () => {
  const chain = makeRecentChain({});

  const res = await method({
    dates: [chain.day_name(1)],
    is_capping_near_round: true,
    is_unguided: true,
    lnd: chain.lnd,
    request: makeRequest(chain),
  });

  const [comparison] = res.comparisons;

  deepEqual(comparison.is_supported, true, 'The price is supported');
  ok(Math.abs(comparison.difference) < 0.01, 'The price is close');

  return;
});

test('Many payments of one exact amount count ten times', async () => {
  // Every payment of a round amount on a day comes to the same value
  const exact = makeRecentChain({price_jitter: 0});

  const res = await method({
    dates: [exact.day_name(1)],
    is_unguided: true,
    lnd: exact.lnd,
    request: makeRequest(exact),
  });

  const [record] = res.records;

  // Thousands of round payments repeat a few dozen exact values
  ok(record.payments < 500, 'Each exact value counts at most ten times');

  return;
});

test('A date not supported as a whole is estimated in windows', async () => {
  // The price jumps by eight percent at 11:00 every day
  const hourlyMoves = [...Array(24).keys()].map(hour => hour < 11 ? 0 : 0.08);

  const chain = makeRecentChain({
    hourly_moves: hourlyMoves,
    prices: Array(5).fill(60000),
  });

  const res = await method({
    dates: [chain.day_name(2)],
    is_reference_guided: true,
    is_sampled: true,
    lnd: chain.lnd,
    request: makeRequest(chain),
  });

  const [comparison] = res.comparisons;

  const supported = comparison.windows.filter(n => !!n.is_supported);

  // The day spent more of its time after the jump than before it
  ok(Math.abs(comparison.cents / 6480000 - 1) < 0.005, 'Price is the median');
  deepEqual(comparison.is_supported, true, 'The windows support the price');
  deepEqual(comparison.windows.length, 12, 'The windows are reported');
  ok(supported.length >= 10, 'The windows are supported');

  const [record] = res.records;

  deepEqual(record.windows, supported.length, 'The record counts windows');

  return;
});
