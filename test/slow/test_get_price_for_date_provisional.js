const {deepEqual} = require('node:assert').strict;
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

// The latest complete day has no round payments, so no estimate supports it,
// and a known price two days before today is bridged from
const quiet = makeChain({quiet_days: [3]});
const quietStore = makeStore({chain: quiet, known: [2]});

// The fourth day is not complete at first, and is complete a day later
const prices = [40123, 42345, 57890, 55555, 56789, 55000];

const later = makeChain({prices, days: 5});
const today = makeChain({prices});

// The day before the fourth day is known, as is a provisional price for it
const completeStore = makeStore({chain: today, known: [3]});

completeStore.known.provisional[today.day_name(4)] = {
  version,
  blocks: [today.tip - 30, today.tip - 6],
  cents: prices[4] * centsPerDollar,
};

// With nothing known, the start steps back from the latest complete day
const unknown = makeChain({quiet_days: [3]});
const unknownStore = makeStore({});

// A chain of ten complete days with a price known only on the first
const tenDayPrices = [...Array(11).keys()].map(n => 50000 + 300 * (n % 3));

const tenDays = makeChain({days: 10, prices: tenDayPrices});
const tenDaysStore = makeStore({chain: tenDays, known: [0]});

// An old provisional price of today survived from an earlier lookup
tenDaysStore.known.provisional[tenDays.day_name(10)] = {
  version,
  blocks: [tenDays.tip - 400, tenDays.tip - 300],
  cents: tenDayPrices[10] * centsPerDollar,
};

const tests = [
  {
    args: makeArgs({chain: quiet, day: 4, store: quietStore}),
    description: 'An undetermined latest day leaves the day before to guide',
    expected: {is_found: true, is_provisional: true},
    measure: res => ({
      is_found: isClose({
        cents: res.cents,
        chain: quiet,
        day: quiet.day_name(4),
      }),
      is_provisional: res.is_provisional,
    }),
  },
  {
    args: makeArgs({chain: later, day: 4, store: completeStore}),
    description: 'A provisional day gets a full price once complete',
    expected: {is_found: true, is_kept: true, is_provisional: false},
    measure: res => ({
      is_found: isClose({
        cents: res.cents,
        chain: today,
        day: today.day_name(4),
      }),
      is_kept: !!completeStore.known.rates[today.day_name(4)],
      is_provisional: res.is_provisional,
    }),
  },
  {
    args: makeArgs({chain: unknown, day: 4, store: unknownStore}),
    description: 'An undetermined latest day is stepped back from for today',
    expected: {is_found: true, is_provisional: true, is_started: true},
    measure: res => ({
      is_found: isClose({
        cents: res.cents,
        chain: unknown,
        day: unknown.day_name(4),
      }),
      is_provisional: res.is_provisional,

      // The day before the undetermined day is the start
      is_started: !!unknownStore.known.rates[unknown.day_name(2)],
    }),
  },
  {
    args: makeArgs({chain: tenDays, day: 10, store: tenDaysStore}),
    description: 'A provisional price left over does not skip a start',
    expected: {is_provisional: true, is_started: true, priors: []},
    measure: res => ({
      is_provisional: res.is_provisional,

      // The lookup starts from the latest complete day
      is_started: !!tenDaysStore.known.rates[tenDays.day_name(9)],
      priors: Object.keys(tenDaysStore.known.priors),
    }),
  },
];

tests.forEach(({args, description, expected, measure}) => {
  return test(description, async () => {
    deepEqual(measure(await method(args)), expected, 'Got expected price');

    return;
  });
});
