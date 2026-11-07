const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const test = require('node:test');

const {makeRecentChain} = require('./../fixtures');
const {makeReferenceRequest} = require('./../fixtures');
const method = require('./../../scripts/compare/compare_chain_prices');
const {referenceDay} = require('./../fixtures');

const {abs} = Math;
const dayFor = url => referenceDay({url}).day;

// The pauses between reference requests pass at once
mock.timers.enable({apis: ['setTimeout']});

// Reference providers trading all day at the price of the chain on a day
const makeRequest = (chain, options) => {
  return makeReferenceRequest(Object.assign({chain}, options, {
    timers: mock.timers,
  }));
};

const chain = makeRecentChain({});
const guide = chain.day_name(3);

// Reference prices that are only expected to be asked for on the date
const ownRequest = (args, cbk) => {
  if (dayFor(args.url) !== chain.day_name(2)) {
    throw new Error('UnexpectedReferenceRequestForAnotherDay');
  }

  return makeRequest(chain)(args, cbk);
};

// Reference prices without a price for the guide day
const guidelessRequest = (args, cbk) => {
  // Exit early when asked for the guide day, which has no reference price
  if (dayFor(args.url) === guide) {
    return cbk('err');
  }

  return makeRequest(chain)(args, cbk);
};

const tests = [
  {
    args: {
      dates: [chain.day_name(2)],
      is_own_reference: true,
      is_reference_guided: true,
      lnd: chain.lnd,
      request: ownRequest,
    },
    description: 'Reference-guided searches can use the date own reference',
    expected: {
      guide_date: chain.day_name(2),
      is_close: true,
      is_guided_by_itself: true,
      is_supported: true,
    },
    measure: ({comparisons}) => {
      const [comparison] = comparisons;

      const reference = comparison.reference_cents;

      return {
        guide_date: comparison.guide_date,
        is_close: abs(comparison.difference) < 0.01,
        is_guided_by_itself: comparison.guide_cents === reference,
        is_supported: comparison.is_supported,
      };
    },
  },
  {
    args: {
      dates: [chain.day_name(2)],
      is_reference_guided: true,
      lnd: chain.lnd,
      request: guidelessRequest,
    },
    description: 'A date whose guide has no reference price is reported',
    expected: {
      cents: undefined,
      error: [503, 'FailedToGetGuidePriceForDay'],
      error_day: guide,
      error_reason: 'FailedToGetReferencePriceFromProviders',
      is_referenced: true,
      records: [],
    },
    measure: ({comparisons, records}) => {
      const [comparison] = comparisons;

      const [code, message, details] = comparison.error;

      return {
        records,
        cents: comparison.cents,
        error: [code, message],
        error_day: details.day,
        error_reason: details.err[1],
        is_referenced: comparison.reference_cents > 0,
      };
    },
  },
];

tests.forEach(({args, description, expected, measure}) => {
  return test(description, async () => {
    deepEqual(measure(await method(args)), expected, 'Got expected result');

    return;
  });
});
