const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const {ok} = require('node:assert').strict;
const test = require('node:test');

const addDays = require('./../../chain/add_days');
const {makeRecentChain} = require('./../fixtures');
const {makeReferenceRequest} = require('./../fixtures');
const method = require('./../../scripts/check_prices');

// The pauses between reference requests pass at once
mock.timers.enable({apis: ['setTimeout']});

const makeArgs = overrides => {
  const chain = makeRecentChain({});

  const args = {
    args: [],
    height: chain.tip,
    lnd: chain.lnd,
    log: () => {},
    request: makeReferenceRequest({chain, timers: mock.timers}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

test('The latest complete days are checked without dates', async () => {
  const lines = [];

  const {comparisons} = await method(makeArgs({
    args: ['--days', '2', '--unguided'],
    log: line => lines.push(line),
  }));

  const [latest, before] = comparisons.map(n => n.date);

  deepEqual(addDays({day: before, days: 1}).day, latest, 'Days are recent');

  ok(comparisons.every(n => !!n.is_supported), 'The prices are supported');

  ok(comparisons.every(n => Math.abs(n.difference) < 0.01), 'Near reference');

  ok(lines.some(n => n.startsWith('Date')), 'A table of the days is shown');

  ok(lines.some(n => n.startsWith('Compared')), 'A summary is shown');

  const summary = 'against the reference prices of 2 days';

  ok(lines.some(n => n.startsWith(summary)), 'Differences are summarized');

  return;
});

test('Dates that are given are derived and checked', async () => {
  const chain = makeRecentChain({});
  const lines = [];

  const {comparisons} = await method({
    args: [chain.day_name(1)],
    height: chain.tip,
    lnd: chain.lnd,
    log: line => lines.push(line),
    request: makeReferenceRequest({chain, timers: mock.timers}),
  });

  deepEqual(comparisons.map(n => n.date), [chain.day_name(1)], 'Date checked');

  ok(Math.abs(comparisons[0].difference) < 0.01, 'The price is near');

  ok(lines.includes(`${chain.day_name(1)} deriving`), 'Progress is shown');

  return;
});
