const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const {ok} = require('node:assert').strict;
const test = require('node:test');

const {makeRecentChain} = require('./../fixtures');
const {makeReferenceRequest} = require('./../fixtures');
const method = require('./../../scripts/compare/compare_chain_prices');

const centsPerDollar = 100;

// The pauses between reference requests pass at once
mock.timers.enable({apis: ['setTimeout']});

// Reference providers trading all day at the price of the chain on a day
const makeRequest = (chain, options) => {
  return makeReferenceRequest(Object.assign({chain}, options, {
    timers: mock.timers,
  }));
};

test('Derived prices are compared with reference prices', async () => {
  const chain = makeRecentChain({});

  const dates = [chain.day_name(1), chain.day_name(2)];

  const {lnd} = chain;

  const res = await method({dates, lnd, request: makeRequest(chain)});

  deepEqual(res.comparisons.map(n => n.date), dates, 'Dates are compared');

  res.comparisons.forEach(comparison => {
    const price = chain.prices[comparison.date] * centsPerDollar;

    deepEqual(comparison.reference_cents, price, 'Reference is the day price');
    deepEqual(comparison.vwap_cents, price, 'Volume weighted price is given');
    deepEqual(comparison.open_cents, price, 'Day open is given');
    deepEqual(comparison.close_cents, price, 'Day close is given');
    deepEqual(comparison.error, undefined, 'The price was derived');
    deepEqual(comparison.source, 'coinbase', 'Reference source is given');
    ok(Math.abs(comparison.cents / price - 1) < 0.01, 'Price is close');
    ok(Math.abs(comparison.difference) < 0.2, 'Difference is reported');

    return;
  });

  ok(res.records.length > dates.length, 'Bridging records are reported');
  ok(!!res.records.find(n => !n.is_sample), 'Full day records are reported');

  return;
});

test('CoinGecko stands in when a day has no candles', async () => {
  const chain = makeRecentChain({});

  const logs = [];
  const missing = [chain.day_name(1)];

  const res = await method({
    dates: [chain.day_name(1), chain.day_name(2)],
    lnd: chain.lnd,
    logger: {info: log => logs.push(log)},
    request: makeRequest(chain, {no_candles: missing}),
  });

  const [first, second] = res.comparisons;

  const start = chain.prices[chain.day_name(1)] * centsPerDollar;
  const next = chain.prices[chain.day_name(2)] * centsPerDollar;

  const middle = Math.round(Math.sqrt(start * next));

  deepEqual(first.reference_cents, middle, 'The middle of the day starts');
  deepEqual([first.open_cents, first.close_cents], [start, next], 'Starts');
  deepEqual(first.source, 'coingecko', 'The stand in source is given');
  deepEqual(second.source, 'coinbase', 'Other days are from the candles');

  const fallbacks = logs.filter(n => !!n.reference_from_coingecko);

  deepEqual(fallbacks.length, 1, 'The fallback is logged');
  deepEqual(fallbacks[0].reference_from_coingecko.date, first.date, 'Dated');
  deepEqual(fallbacks[0].reference_from_coingecko.reason, 'NotFound', 'Why');

  return;
});

test('A date that cannot be priced is reported with its error', async () => {
  const chain = makeRecentChain({quiet_days: [2]});

  const res = await method({
    dates: [chain.day_name(2)],
    lnd: chain.lnd,
    request: makeRequest(chain),
  });

  const [comparison] = res.comparisons;

  deepEqual(comparison.cents, undefined, 'No price was derived');
  deepEqual(comparison.error[1], 'FailedToFindSupportedPrice', 'Error given');
  deepEqual(comparison.difference, undefined, 'No difference to report');
  ok(comparison.reference_cents > 0, 'Reference is still reported');

  return;
});

test('A day that cannot be priced is not estimated again', async () => {
  const chain = makeRecentChain({quiet_days: [2]});

  // The count of blocks fetched as the derivation of each date starts
  const fetched = [];

  const res = await method({
    dates: [chain.day_name(1), chain.day_name(0)],
    lnd: chain.lnd,
    logger: {
      info: line => {
        return !!line.deriving_price_for && fetched.push(chain.calls.blocks);
      },
    },
    request: makeRequest(chain),
  });

  deepEqual(
    res.comparisons.map(n => n.error[2].day),
    [chain.day_name(2), chain.day_name(2)],
    'Both dates fail at the quiet day'
  );

  const [first, second] = fetched;

  ok(second > first, 'Blocks are fetched for the first date');
  deepEqual(chain.calls.blocks, second, 'No blocks are fetched again');

  return;
});

test('Progress is logged when there is a logger', async () => {
  const chain = makeRecentChain({});
  const logs = [];

  await method({
    dates: [chain.day_name(2)],
    lnd: chain.lnd,
    logger: {info: log => logs.push(log)},
    request: makeRequest(chain),
  });

  deepEqual(logs[0], {deriving_price_for: chain.day_name(2)}, 'Start logged');
  const start = {fetching_blocks: {date: chain.day_name(3), blocks: '0/144'}};
  const step = {fetching_blocks: {date: chain.day_name(3), blocks: '24/144'}};

  deepEqual(logs[1], start, 'Fetching the start day is logged');
  deepEqual(logs[2], step, 'Fetching progress is logged');
  const isStart = n => !!n.chain_price && !!n.chain_price.starting_from;

  ok(logs.find(isStart), 'Start');
  const dated = logs.filter(n => !!n.chain_price).map(n => n.chain_price.date);

  ok(dated.includes(chain.day_name(2)), 'The date price is logged');

  const {compared} = logs[logs.length - 1];

  deepEqual(compared.date, chain.day_name(2), 'The comparison is logged last');
  ok(/^\d+\.\d{2}$/.test(compared.chain_price), 'Chain price is logged');
  ok(/^\d+\.\d{2}$/.test(compared.reference_price), 'Reference is logged');
  ok(/^-?\d+\.\d{2}%$/.test(compared.difference), 'Difference is logged');

  return;
});
