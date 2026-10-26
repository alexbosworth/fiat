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
];

tests.forEach(({args, description, error}) => {
  return test(description, async () => {
    await rejects(method(args), error, 'Got expected error');

    return;
  });
});

test('A date with no reference price is reported, not derived', async () => {
  const chain = makeRecentChain({});
  const logs = [];

  const res = await method({
    dates: [chain.day_name(2)],
    lnd: chain.lnd,
    logger: {info: log => logs.push(log)},
    request: (args, cbk) => cbk('err'),
  });

  const [comparison] = res.comparisons;

  deepEqual(comparison.date, chain.day_name(2), 'The date is reported');
  deepEqual(comparison.cents, undefined, 'No price was derived');
  const [code, message, details] = comparison.error;

  deepEqual([code, message], [503, 'FailedToGetReferencePriceForDay'], 'Err');
  deepEqual(details.day, chain.day_name(2), 'The day is named');
  deepEqual(details.err[1], 'FailedToGetReferencePriceFromProviders', 'Why');
  deepEqual(res.records, [], 'Nothing was derived');
  deepEqual(logs.length, 1, 'Only the comparison is logged');
  deepEqual(logs[0].compared.error[1], 'FailedToGetReferencePriceForDay');

  return;
});
