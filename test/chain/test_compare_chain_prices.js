const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const {rejects} = require('node:assert').strict;
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

// A chain whose days have no reference prices to compare with
const unreferenced = makeRecentChain({});

// Compare chain prices, with the first comparison and what was logged
const compareLogged = async args => {
  const logs = [];

  const res = await method(Object.assign({}, args, {
    logger: {info: line => logs.push(line)},
  }));

  const [comparison] = res.comparisons;

  const [code, message, details] = comparison.error;

  return {
    cents: comparison.cents,
    date: comparison.date,
    error: [code, message],
    error_day: details.day,
    error_reason: details.err[1],
    logged: logs.map(line => line.compared.error[1]),
    records: res.records,
  };
};

const makeArgs = overrides => {
  const chain = makeRecentChain({});

  const args = {
    dates: [chain.day_name(1), chain.day_name(2)],
    lnd: chain.lnd,
    request: makeRequest(chain),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({dates: ['yesterday']}),
    description: 'Formatted dates are required',
    error: [400, 'ExpectedYyyyMmDdDatesToCompareChainPrices'],
  },
  {
    args: makeArgs({dates: ['2024-02-30']}),
    description: 'Dates on the calendar are required',
    error: [400, 'ExpectedYyyyMmDdDatesToCompareChainPrices'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToCompareChainPrices'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request function is required',
    error: [400, 'ExpectedRequestFunctionToCompareChainPrices'],
  },
  {
    args: makeArgs({is_own_reference: true}),
    description: 'An own reference guides a reference-guided comparison',
    error: [400, 'ExpectedReferenceGuidedModeForOwnReference'],
  },
  {
    args: makeArgs({is_reference_guided: true, is_unguided: true}),
    description: 'A comparison is unguided or reference-guided, not both',
    error: [400, 'ExpectedOneModeToCompareChainPrices'],
  },
  {
    args: makeArgs({is_sampled: true}),
    description: 'Sampling is for a reference-guided comparison',
    error: [400, 'ExpectedReferenceGuidedModeForSampling'],
  },
  {
    args: makeArgs({is_capping_near_round: true}),
    description: 'Capping near round values is for own block estimates',
    error: [400, 'ExpectedOwnBlockEstimatesToCapNearRoundValues'],
  },
  {
    args: {
      dates: [unreferenced.day_name(2)],
      lnd: unreferenced.lnd,
      request: (args, cbk) => cbk('err'),
    },
    description: 'A date with no reference price is reported, not derived',
    expected: {
      cents: undefined,
      date: unreferenced.day_name(2),
      error: [503, 'FailedToGetReferencePriceForDay'],
      error_day: unreferenced.day_name(2),
      error_reason: 'FailedToGetReferencePriceFromProviders',
      logged: ['FailedToGetReferencePriceForDay'],
      records: [],
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await compareLogged(args), expected, 'Got expected result');
    }

    return;
  });
});
