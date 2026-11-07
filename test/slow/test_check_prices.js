const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const test = require('node:test');

const addDays = require('./../../chain/add_days');
const {makeRecentChain} = require('./../fixtures');
const {makeReferenceRequest} = require('./../fixtures');
const method = require('./../../scripts/check_prices');

const {abs} = Math;

// The pauses between reference requests pass at once
mock.timers.enable({apis: ['setTimeout']});

const chain = makeRecentChain({});

// Comparisons are near their references
const isNear = comparisons => comparisons.every(n => abs(n.difference) < 0.01);

// Check prices, with the comparisons and the lines that were logged
const checkPrices = async args => {
  const lines = [];

  const {comparisons} = await method(Object.assign({}, args, {
    log: line => lines.push(line),
  }));

  return {comparisons, lines};
};

const makeArgs = overrides => {
  const args = {
    args: [],
    height: chain.tip,
    lnd: chain.lnd,
    request: makeReferenceRequest({chain, timers: mock.timers}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({args: ['--days', '2', '--unguided']}),
    description: 'The latest complete days are checked without dates',
    expected: {
      has_summary: true,
      has_table: true,
      has_total: true,
      is_near: true,
      is_recent: true,
      is_supported: true,
    },
    measure: ({comparisons, lines}) => {
      const [latest, before] = comparisons.map(n => n.date);

      const summary = 'against the reference prices of 2 days';

      return {
        has_summary: lines.some(n => n.startsWith(summary)),
        has_table: lines.some(n => n.startsWith('Date')),
        has_total: lines.some(n => n.startsWith('Compared')),
        is_near: isNear(comparisons),
        is_recent: addDays({day: before, days: 1}).day === latest,
        is_supported: comparisons.every(n => !!n.is_supported),
      };
    },
  },
  {
    args: makeArgs({args: [chain.day_name(1)]}),
    description: 'Dates that are given are derived and checked',
    expected: {
      dates: [chain.day_name(1)],
      has_progress: true,
      is_near: true,
    },
    measure: ({comparisons, lines}) => ({
      dates: comparisons.map(n => n.date),
      has_progress: lines.includes(`${chain.day_name(1)} deriving`),
      is_near: isNear(comparisons),
    }),
  },
];

tests.forEach(({args, description, expected, measure}) => {
  return test(description, async () => {
    deepEqual(measure(await checkPrices(args)), expected, 'Got check');

    return;
  });
});
