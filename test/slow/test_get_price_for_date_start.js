const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const {makeStore} = require('./../fixtures');
const method = require('./../../chain/estimates/get_price_for_date');
const {methodVersion} = require('./../../chain/known');

const {abs} = Math;
const centsPerDollar = 100;
const {version} = methodVersion({});

// Chains start well after the earliest supported day
const genesis = Date.parse('2026-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

// A price is near the price of a day of a chain
const isClose = ({cents, chain, day}) => {
  return abs(cents / (chain.prices[day] * centsPerDollar) - 1) < 0.01;
};

// Arguments to look up the price of a day of a chain with a store of prices
const makeArgs = ({chain, day, store}) => ({
  date: chain.day(day),
  get_prices: store.get_prices,
  height: chain.tip,
  lnd: chain.lnd,
  put_price: store.put_price,
});

// The logs of a lookup where it stepped back from a starting day
const steppedBack = logs => logs.filter(n => !!n.unsupported_starting_day);

// A chain of days whose payments never form a supported pattern
const flat = makeChain({
  days: 8,
  payments_per_block: 10,
  prices: [40123, 42345, 57890, 55555, 56789, 51234, 49876, 52345, 53456],
  spike_weights: {10: 1, 20: 1, 50: 1, 100: 1},
});

// The latest complete day has no round payments at all
const quiet = makeChain({quiet_days: [3]});
const quietLogs = [];
const quietStore = makeStore({});

// The latest complete day has no payments at all, nor the day after it
const empty = makeChain({empty_days: [3, 4]});
const emptyLogs = [];

// A price known long before the chain, at half of the prices on the chain
const distant = makeChain({});
const distantStore = makeStore({});

distantStore.known.rates['2025-10-20'] = {
  version,
  cents: distant.prices[distant.day_name(3)] * centsPerDollar / 2,
};

// A chain where the first day has a known price
const prices = [...Array(13).keys()].map(n => 60000 + n * 500);

const longer = makeChain({prices, days: 12});
const nineStore = makeStore({chain: longer, known: [0]});
const tenStore = makeStore({chain: longer, known: [0]});

const tests = [
  {
    args: makeArgs({chain: flat, day: 1, store: makeStore({})}),
    description: 'A supported starting price is required',
    error: [503, 'FailedToFindSupportedStartingPrice', {
      // The latest complete day and the six days before it are tried
      days: [7, 6, 5, 4, 3, 2, 1].map(n => flat.day_name(n)),
    }],
  },
  {
    args: Object.assign(
      makeArgs({chain: quiet, day: 1, store: quietStore}),
      {logger: {info: log => quietLogs.push(log)}}
    ),
    description: 'An unsupported latest day is stepped back from',
    expected: {
      is_found: true,

      // The day before the quiet day is the starting day
      rates: [quiet.day_name(1), quiet.day_name(2)],
      stepped_back: [{unsupported_starting_day: quiet.day_name(3)}],
    },
    measure: res => ({
      is_found: isClose({
        cents: res.cents,
        chain: quiet,
        day: quiet.day_name(1),
      }),
      rates: Object.keys(quietStore.known.rates).sort(),
      stepped_back: steppedBack(quietLogs),
    }),
  },
  {
    args: Object.assign(
      makeArgs({chain: empty, day: 1, store: makeStore({})}),
      {logger: {info: log => emptyLogs.push(log)}}
    ),
    description: 'A latest day without a price is stepped back from',
    expected: {
      is_found: true,
      stepped_back: [{unsupported_starting_day: empty.day_name(3)}],
    },
    measure: res => ({
      is_found: isClose({
        cents: res.cents,
        chain: empty,
        day: empty.day_name(1),
      }),
      stepped_back: steppedBack(emptyLogs),
    }),
  },
  {
    args: Object.assign(makeArgs({
      chain: empty,
      day: 3,
      store: makeStore({}),
    }),
    {
      get_prices: ({}, cbk) => cbk(null, {
        priors: {},
        rates: {
          [empty.day_name(1)]: {
            version,
            cents: empty.prices[empty.day_name(1)] * centsPerDollar,
          },
        },
      }),
    }),
    description: 'Bridging through a day whose blocks give no price fails',
    error: [503, 'FailedToFindSupportedPrice', {day: empty.day_name(3)}],
  },
  {
    args: makeArgs({chain: distant, day: 1, store: distantStore}),
    description: 'A day far from known prices starts from the latest day',
    expected: {
      is_found: true,

      // Only the day between the day and the latest day is bridged
      priors: [distant.day_name(2)],
      rates: ['2025-10-20', distant.day_name(1), distant.day_name(3)],
      start: distant.day_name(3),
    },
    measure: res => ({
      is_found: isClose({
        cents: res.cents,
        chain: distant,
        day: distant.day_name(1),
      }),
      priors: Object.keys(distantStore.known.priors),
      rates: Object.keys(distantStore.known.rates).sort(),
      start: distantStore.puts[0].date,
    }),
  },
  {
    args: makeArgs({chain: longer, day: 9, store: nineStore}),
    description: 'A day is bridged to from a known price within a week',
    expected: {
      is_found: true,

      // Nine days from the known price and two from the latest complete day
      rates: [longer.day_name(0), longer.day_name(9)],
    },
    measure: res => ({
      is_found: abs(res.cents / (prices[9] * centsPerDollar) - 1) < 0.01,
      rates: Object.keys(nineStore.known.rates).sort(),
    }),
  },
  {
    args: makeArgs({chain: longer, day: 10, store: tenStore}),
    description: 'A day over a week farther is bridged from the latest day',
    expected: {
      is_found: true,

      // Ten days from the known price and one from the latest complete day
      rates: [longer.day_name(0), longer.day_name(10), longer.day_name(11)],
    },
    measure: res => ({
      is_found: abs(res.cents / (prices[10] * centsPerDollar) - 1) < 0.01,
      rates: Object.keys(tenStore.known.rates).sort(),
    }),
  },
];

tests.forEach(({args, description, error, expected, measure}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(measure(await method(args)), expected, 'Got expected price');
    }

    return;
  });
});
