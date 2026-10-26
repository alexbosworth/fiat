const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const {ok} = require('node:assert').strict;
const test = require('node:test');

const {makeRecentChain} = require('./../fixtures');
const {makeReferenceRequest} = require('./../fixtures');
const method = require('./../../scripts/compare/compare_chain_prices');
const {referenceDay} = require('./../fixtures');

const dayFor = url => referenceDay({url}).day;

// The pauses between reference requests pass at once
mock.timers.enable({apis: ['setTimeout']});

// Reference providers trading all day at the price of the chain on a day
const makeRequest = (chain, options) => {
  return makeReferenceRequest(Object.assign({chain}, options, {
    timers: mock.timers,
  }));
};

test('Reference-guided searches can use the date own reference', async () => {
  const chain = makeRecentChain({});
  const requests = [];

  const res = await method({
    dates: [chain.day_name(2)],
    is_own_reference: true,
    is_reference_guided: true,
    lnd: chain.lnd,
    request: (args, cbk) => {
      requests.push(dayFor(args.url));

      return makeRequest(chain)(args, cbk);
    },
  });

  const [comparison] = res.comparisons;

  deepEqual(requests, [chain.day_name(2)], 'Only the date reference is asked');
  deepEqual(comparison.guide_date, chain.day_name(2), 'The date guides');
  deepEqual(comparison.guide_cents, comparison.reference_cents, 'By itself');
  deepEqual(comparison.is_supported, true, 'The price is supported');
  ok(Math.abs(comparison.difference) < 0.01, 'The price is close');

  return;
});

test('A date whose guide has no reference price is reported', async () => {
  const chain = makeRecentChain({});

  const guide = chain.day_name(3);
  const request = makeRequest(chain);

  const res = await method({
    dates: [chain.day_name(2)],
    is_reference_guided: true,
    lnd: chain.lnd,
    request: (args, cbk) => {
      // The guide day has no reference price
      if (dayFor(args.url) === guide) {
        return cbk('err');
      }

      return request(args, cbk);
    },
  });

  const [comparison] = res.comparisons;

  const [code, message, details] = comparison.error;

  deepEqual([code, message], [503, 'FailedToGetGuidePriceForDay'], 'Error');
  deepEqual(details.day, guide, 'The guide day is named');
  deepEqual(details.err[1], 'FailedToGetReferencePriceFromProviders', 'Why');
  deepEqual(comparison.cents, undefined, 'No price was derived');
  ok(comparison.reference_cents > 0, 'The reference is still reported');
  deepEqual(res.records, [], 'Nothing was derived');

  return;
});
