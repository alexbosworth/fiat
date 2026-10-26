const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const {ok} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {getPriceForDate} = require('./../../chain/estimates');
const {makeRecentChain} = require('./../fixtures');
const {makeReferenceRequest} = require('./../fixtures');
const method = require('./../../scripts/compare/compare_chain_prices');
const {methodVersion} = require('./../../chain/known');
const {referenceDay} = require('./../fixtures');

const centsPerDollar = 100;
const dayFor = url => referenceDay({url}).day;

// The pauses between reference requests pass at once
mock.timers.enable({apis: ['setTimeout']});

// Reference providers trading all day at the price of the chain on a day
const makeRequest = (chain, options) => {
  return makeReferenceRequest(Object.assign({chain}, options, {
    timers: mock.timers,
  }));
};

test('Reference-guided dates are searched in next day windows', async () => {
  const chain = makeRecentChain({});
  const logs = [];
  const requests = [];

  const dates = [chain.day_name(1), chain.day_name(2)];
  const guides = [chain.day_name(2), chain.day_name(3)];

  const res = await method({
    dates,
    is_reference_guided: true,
    lnd: chain.lnd,
    logger: {info: log => logs.push(log)},
    request: (args, cbk) => {
      requests.push(dayFor(args.url));

      return makeRequest(chain)(args, cbk);
    },
  });

  const prices = guides.map(day => chain.prices[day] * centsPerDollar);

  deepEqual(requests, [...dates, chain.day_name(3)], 'Each day asked once');
  deepEqual(res.comparisons.map(n => n.guide_date), guides, 'Next days guide');
  deepEqual(res.comparisons.map(n => n.guide_cents), prices, 'Guide prices');
  deepEqual(res.records.map(n => n.date), dates, 'One record per date');
  deepEqual(res.records.some(n => !!n.is_sample), false, 'No bridging');

  res.comparisons.forEach(comparison => {
    deepEqual(comparison.error, undefined, 'The price was derived');
    deepEqual(comparison.is_supported, true, 'The price is supported');
    deepEqual(comparison.is_widened, undefined, 'It was inside the window');
    deepEqual(comparison.is_conflict, undefined, 'It is not a conflict');
    ok(Math.abs(comparison.difference) < 0.01, 'The price is close');

    return;
  });

  const compared = logs.filter(n => !!n.compared).map(n => n.compared);

  const shown = guides.map(day => chain.prices[day].toFixed(2));

  deepEqual(compared.map(n => n.guide_price), shown, 'Guides are logged');

  // A derivation guided by the same price finds the same price
  const [first] = res.comparisons;

  const {cents} = await getPriceForDate({
    date: first.date,
    get_prices: ({}, cbk) => cbk(null, {
      rates: {
        [first.guide_date]: {
          cents: first.guide_cents,
          version: methodVersion({}).version,
        },
      },
    }),
    height: chain.tip,
    lnd: chain.lnd,
    put_price: ({}, cbk) => cbk(),
  });

  deepEqual(cents, first.cents, 'Same price as a derivation with the guide');

  return;
});

test('Reference-guided searches widen and check for conflicts', async () => {
  // Day 1 is half the price of day 2, and day 3 is far below day 4
  const chain = makeRecentChain({prices: [40123, 20123, 41234, 30123, 52345]});

  const res = await method({
    dates: [chain.day_name(1), chain.day_name(3)],
    is_reference_guided: true,
    lnd: chain.lnd,
    request: makeRequest(chain),
  });

  const [conflict, widened] = res.comparisons;

  deepEqual(conflict.is_widened, true, 'The search was widened');
  deepEqual(conflict.is_supported, true, 'The widened price is supported');
  deepEqual(conflict.is_conflict, true, 'But it is an alias of its guide');
  ok(Math.abs(conflict.difference) < 0.01, 'Even though it is right');

  deepEqual(widened.is_widened, true, 'A large move widens the search');
  deepEqual(widened.is_supported, true, 'The widened price is supported');
  deepEqual(widened.is_conflict, undefined, 'And it is not a conflict');
  ok(Math.abs(widened.difference) < 0.01, 'The price is close');

  // Derivations guided by the same prices reach the same outcomes
  const derive = args => getPriceForDate({
    date: args.date,
    get_prices: ({}, cbk) => cbk(null, {
      rates: {
        [args.guide_date]: {
          cents: args.guide_cents,
          version: methodVersion({}).version,
        },
      },
    }),
    height: chain.tip,
    lnd: chain.lnd,
    put_price: ({}, cbk) => cbk(),
  });

  await rejects(
    derive(conflict),
    [503, 'FoundPriceAtAliasOfNeighboringDayPrice'],
    'A derivation refuses the conflict'
  );

  const {cents} = await derive(widened);

  deepEqual(cents, widened.cents, 'A derivation accepts the widened price');

  return;
});

test('A date is compared before later references are fetched', async () => {
  const chain = makeRecentChain({});
  const events = [];

  const dates = [chain.day_name(1), chain.day_name(2)];

  await method({
    dates,
    is_reference_guided: true,
    lnd: chain.lnd,
    logger: {
      info: log => {
        if (!!log.compared) {
          events.push(`compared ${log.compared.date}`);
        }

        return;
      },
    },
    request: (args, cbk) => {
      events.push(`asked ${dayFor(args.url)}`);

      return makeRequest(chain)(args, cbk);
    },
  });

  const expected = [
    `asked ${dates[0]}`,
    `asked ${dates[1]}`,
    `compared ${dates[0]}`,
    `asked ${chain.day_name(3)}`,
    `compared ${dates[1]}`,
  ];

  deepEqual(events, expected, 'References are asked for as dates come up');

  return;
});

test('Reference-guided dates can be estimated from samples', async () => {
  const chain = makeRecentChain({});

  const res = await method({
    dates: [chain.day_name(2)],
    is_reference_guided: true,
    is_sampled: true,
    lnd: chain.lnd,
    request: makeRequest(chain),
  });

  const [comparison] = res.comparisons;
  const [record] = res.records;

  deepEqual(comparison.is_supported, true, 'The sampled price is supported');
  ok(comparison.sample_blocks < 144, 'Only a sample of the blocks was used');
  deepEqual(record.is_sample, true, 'The record is of a sample');
  ok(Math.abs(comparison.difference) < 0.01, 'The price is close');

  // Bridging from the same guide to the day before samples the same blocks
  const bridged = [];

  await getPriceForDate({
    date: chain.day_name(1),
    get_prices: ({}, cbk) => cbk(null, {
      rates: {
        [comparison.guide_date]: {
          cents: comparison.guide_cents,
          version: methodVersion({}).version,
        },
      },
    }),
    height: chain.tip,
    lnd: chain.lnd,
    put_price: (estimate, cbk) => {
      bridged.push(estimate);

      return cbk();
    },
  });

  const sample = bridged.find(n => n.date === comparison.date);

  deepEqual(sample.is_sample, true, 'Bridging sampled the date');
  deepEqual(sample.cents, comparison.cents, 'Same price as when bridging');

  return;
});
