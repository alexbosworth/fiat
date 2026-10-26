const {mock} = require('node:test');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

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

const tests = [
  {
    args: makeArgs({args: ['yesterday']}),
    description: 'Dates are days of the calendar',
    error: 'ExpectedYyyyMmDdDatesToCheckPrices',
  },
  {
    args: makeArgs({args: ['--days', '0']}),
    description: 'A count of days is positive',
    error: 'ExpectedPositiveCountOfDaysToCheckPrices',
  },
];

tests.forEach(({args, description, error}) => {
  return test(description, async () => {
    await rejects(method(args), {message: error}, 'Got expected error');

    return;
  });
});
