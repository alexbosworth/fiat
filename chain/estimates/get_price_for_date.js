const asyncAuto = require('async/auto');
const asyncTimesSeries = require('async/timesSeries');
const {returnResult} = require('asyncjs-util');

const addDays = require('./../add_days');
const checkKnownEstimates = require('./check_known_estimates');
const {confirmationsAfterDay} = require('./../constants');
const currentEstimates = require('./current_estimates');
const {dayOfDate} = require('./../../dates');
const {earliestSupportedDay} = require('./../known');
const estimateAndRemember = require('./estimate_and_remember');
const {findCompleteDay} = require('./../blocks');
const findStartingDay = require('./find_starting_day');
const {getBlocksForDate} = require('./../blocks');
const {getMedianTime} = require('./../blocks');
const getProvisionalPrice = require('./get_provisional_price');
const {msPerDay} = require('./../constants');
const {msPerSecond} = require('./../constants');
const nearestEstimate = require('./nearest_estimate');

const {abs} = Math;
const dayStart = day => Date.parse(`${day}T00:00:00.000Z`);
const {isArray} = Array;
const isHeight = n => Number.isInteger(n) && n >= 0;
const {max} = Math;
const maxProvisionalAge = 12;
const maxTipLagMs = 1000 * 60 * 60 * 6;
const minProvisionalBlocks = 36;
const minSupportedDay = earliestSupportedDay({}).day;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);
const startSavingDays = 7;
const yesterday = -1;

/** Get the USD price of BTC on the day of a date using only chain data

  {
    date: <ISO 8601 Date String>
    get_prices: <Get Known Prices Function> ({}, cbk) => (err, {
      [priors]: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
      [provisional]: {
        <Day YYYY-MM-DD String>: {
          [blocks]: [<First Block Height Number>, <Last Block Height Number>]
          cents: <USD Cents Number>
        }
      }
      [rates]: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
    })
    height: <Current Best Chain Height Number>
    lnd: <Authenticated LND API Object>
    [logger]: <Winston Logger Object>
    put_price: <Remember Price Function> ({
      agreement: <Spike Strengths Agreement With Template Weights Number>
      blocks: [<First Block Height Number>, <Last Block Height Number>]
      cents: <USD Cents Per BTC Number>
      confidence: <Best Position Score Over Best Alias Position Score Number>
      coverage: <Share of Spike Excess At Round USD Positions Number>
      date: <Day YYYY-MM-DD String>
      dispersion: <Peak Width Beyond Smoothing As Price Fraction Number>
      [drift]: <Second Half Price Change From First Half Price Number>
      evidence: <Share of Prior Weight Observable At the Price Number>
      hash: <Last Block Hash Hex String>
      [is_provisional]: <Price Is For An Incomplete Day Bool>
      [is_sample]: <Price Is A Rough Estimate From Sample Blocks Bool>
      [is_widened]: <Price Was Found Outside the Expected Price Window Bool>
      outputs: <Payment Outputs Considered Count Number>
      payments: <Estimated Round USD Payments Count Number>
      rivalry: <Best Patterned Rival Position Score Over Best Score Number>
      round_shift: <Price Change If Round BTC Values Were Counted Number>
      significance: <Payment Peak Beyond Noise In Standard Deviations Number>
      spikes: [{
        strength: <Spike Strength Relative to the Strongest Spike Number>
        usd: <Round USD Amount Number>
      }]
      stability: <Largest Price Change From Perturbed Refinement Number>
      version: <Method Version String>
      [windows]: <Supported Windows Inside the Price Window Count Number>
    }, cbk) => (err)
    [remove_prices]: <Remove Prices Function> ({
      removed: [{
        day: <Day YYYY-MM-DD String>
        hash: <Last Block Hash Hex String>
      }]
    }, cbk) => (err)
    [unsupported]: <Unsupported Estimates Map Object>
  }

  @returns via cbk or Promise
  {
    cents: <USD Cents Per BTC Number>
    is_provisional: <Price Is Provisional Bool>
  }
*/
module.exports = (args, cbk) => {
  // The blocks of the day priced in full are kept for its other estimates
  const dayBlocks = new Map();

  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.date || typeof args.date !== 'string') {
          return cbk([400, 'ExpectedDateToGetPriceForDate']);
        }

        const {day} = dayOfDate({date: args.date});

        if (!day) {
          return cbk([400, 'ExpectedValidDateToGetPriceForDate']);
        }

        if (day < minSupportedDay) {
          return cbk([400, 'DateBeforeSupportedRangeToGetPriceForDate', {
            earliest_day: minSupportedDay,
          }]);
        }

        if (typeof args.get_prices !== 'function') {
          return cbk([400, 'ExpectedGetPricesFunctionToGetPriceForDate']);
        }

        if (!isHeight(args.height)) {
          return cbk([400, 'ExpectedCurrentChainHeightToGetPriceForDate']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetPriceForDate']);
        }

        if (typeof args.put_price !== 'function') {
          return cbk([400, 'ExpectedPutPriceFunctionToGetPriceForDate']);
        }

        if (!!args.remove_prices && typeof args.remove_prices !== 'function') {
          return cbk([400, 'ExpectedRemovePricesFunctionToGetPriceForDate']);
        }

        return cbk();
      },

      // The day of the date in UTC
      day: ['validate', ({}, cbk) => cbk(null, dayOfDate(args).day)],

      // Block times are kept across days to avoid retrieving them twice
      times: ['validate', ({}, cbk) => cbk(null, new Map())],

      // Get the known prices
      getPrices: ['validate', ({}, cbk) => args.get_prices({}, cbk)],

      // The known prices that were derived by the current method
      estimates: ['getPrices', ({getPrices}, cbk) => {
        if (!getPrices) {
          return cbk([503, 'ExpectedKnownPricesToGetPriceForDate']);
        }

        const {priors, provisional, rates} = currentEstimates({
          priors: getPrices.priors,
          provisional: getPrices.provisional,
          rates: getPrices.rates,
        });

        return cbk(null, {priors, provisional, rates});
      }],

      // Check that recently derived known prices are still in the chain
      checkKnown: ['estimates', ({estimates}, cbk) => {
        return checkKnownEstimates({
          estimates,
          height: args.height,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Prices from replaced blocks are removed where they are kept too
      removeKnown: ['checkKnown', ({checkKnown}, cbk) => {
        const {removed} = checkKnown;

        // Exit early when there is nothing to remove or nowhere to remove it
        if (!removed.length || !args.remove_prices) {
          return cbk();
        }

        return args.remove_prices({removed}, cbk);
      }],

      // Estimate the price for a day and remember it when it is supported
      estimate: ['estimates', 'times', ({estimates, times}, cbk) => {
        const estimate = (target, cbk) => {
          return estimateAndRemember({
            estimates,
            times,
            blocks: target.blocks,
            day: target.day,
            height: args.height,
            is_sample: target.is_sample,
            is_unguided: target.is_unguided,
            lnd: args.lnd,
            logger: args.logger,
            put_price: args.put_price,
            unsupported: args.unsupported,
          },
          cbk);
        };

        return cbk(null, estimate);
      }],

      // Check if the day is complete and can have a final price
      getBlocks: [
        'day',
        'estimates',
        'removeKnown',
        'times',
        ({day, estimates, times}, cbk) =>
      {
        // Exit early when the price is already known
        if (!!estimates.rates[day]) {
          return cbk();
        }

        return getBlocksForDate({
          times,
          date: day,
          height: args.height,
          lnd: args.lnd,
        },
        cbk);
      }],

      // A recent provisional price of an incomplete day is reused
      reuse: [
        'day',
        'estimates',
        'getBlocks',
        ({day, estimates, getBlocks}, cbk) =>
      {
        // Exit early when the price is known or the day is complete
        if (!getBlocks || !!getBlocks.is_complete) {
          return cbk();
        }

        const {blocks} = estimates.provisional[day] || {};

        // A provisional price ends six blocks below the tip it was derived
        // at, so it is reused until about six more blocks have been mined
        const age = !isArray(blocks) ? Infinity : args.height - blocks[1];

        // Exit early when there is no recent provisional price
        if (age > maxProvisionalAge) {
          return cbk();
        }

        return cbk(null, {
          cents: estimates.provisional[day].cents,
          is_provisional: true,
        });
      }],

      // Get the time of the chain tip when the day is not complete
      getTipTime: [
        'getBlocks',
        'reuse',
        'times',
        ({getBlocks, reuse, times}, cbk) =>
      {
        // Exit early when the price is known or the day is complete
        if (!getBlocks || !!getBlocks.is_complete || !!reuse) {
          return cbk();
        }

        return getMedianTime({
          times,
          height: args.height,
          lnd: args.lnd,
        },
        cbk);
      }],

      // A day that has not started, or that the chain has not reached, fails
      checkStarted: ['day', 'getTipTime', ({day, getTipTime}, cbk) => {
        // Exit early when there is no incomplete day to check
        if (!getTipTime) {
          return cbk();
        }

        const tipTime = getTipTime.time * msPerSecond;

        // The chain tip can be later than the clock, as in a simulation
        if (dayStart(day) > max(Date.now(), tipTime)) {
          return cbk([400, 'DateAfterCurrentDayToGetPriceForDate', {day}]);
        }

        // A chain that is far behind the day has none of its blocks yet
        if (dayStart(day) - tipTime > maxTipLagMs) {
          return cbk([503, 'ChainHasNotReachedDayToGetPriceForDate', {day}]);
        }

        return cbk();
      }],

      // The latest complete day guides the price of an incomplete day
      getLatest: [
        'checkStarted',
        'getBlocks',
        'reuse',
        'times',
        ({getBlocks, reuse, times}, cbk) =>
      {
        // Exit early when the price is known or the day is complete
        if (!getBlocks || !!getBlocks.is_complete || !!reuse) {
          return cbk();
        }

        return findCompleteDay({
          times,
          height: args.height,
          lnd: args.lnd,
        },
        cbk);
      }],

      // A complete day is bridged to directly, and an incomplete day through
      // the latest complete day before it, so the guide of its provisional
      // price is never further back, both from complete day estimates only
      route: [
        'day',
        'getBlocks',
        'getLatest',
        'reuse',
        ({day, getBlocks, getLatest, reuse}, cbk) =>
      {
        // Exit early when the price is already known or is reused
        if (!getBlocks || !!reuse) {
          return cbk();
        }

        // Exit early when the day is complete
        if (!!getBlocks.is_complete) {
          return cbk(null, {is_complete: true, target: day});
        }

        return cbk(null, {latest: getLatest.day, target: getLatest.day});
      }],

      // The nearest estimate that the day can be bridged to from
      nearest: ['estimates', 'route', ({estimates, route}, cbk) => {
        // Exit early when there is nothing to bridge to
        if (!route) {
          return cbk();
        }

        return cbk(null, nearestEstimate({
          estimates,
          day: route.target,
          latest: route.latest,
        }));
      }],

      // A complete day far from any estimate can start from the latest
      // complete day instead, so the latest complete day is found for it
      getStart: [
        'nearest',
        'route',
        'times',
        ({nearest, route, times}, cbk) =>
      {
        // Exit early when there is no complete day to bridge to
        if (!route || !route.is_complete) {
          return cbk();
        }

        const {estimate} = nearest;

        // Exit early when starting over cannot save a week of bridging
        if (!!estimate && estimate.distance <= startSavingDays) {
          return cbk();
        }

        return findCompleteDay({
          times,
          height: args.height,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Start from the latest complete day when no estimate is near the day
      coldStart: [
        'estimate',
        'getStart',
        'nearest',
        'route',
        ({estimate, getStart, nearest, route}, cbk) =>
      {
        // Exit early when there is nothing to bridge to
        if (!route) {
          return cbk();
        }

        const closest = nearest.estimate;

        // Exit early when starting over cannot save a week of bridging
        if (!!closest && closest.distance <= startSavingDays) {
          return cbk();
        }

        // Either kind of day starts from the latest complete day
        const latest = !!getStart ? getStart.day : route.latest;

        const away = abs(dayStart(latest) - dayStart(route.target)) / msPerDay;

        // Exit early when the latest complete day is not a week nearer
        if (!!closest && closest.distance - away <= startSavingDays) {
          return cbk();
        }

        return findStartingDay({
          latest,
          logger: args.logger,
          estimate: (target, cbk) => estimate({
            blocks: target.day === route.target ? dayBlocks : undefined,
            day: target.day,
            is_sample: target.is_sample,
            is_unguided: target.is_unguided,
          },
          cbk),
        },
        cbk);
      }],

      // Step day by day from the nearest estimate towards the day
      bridge: [
        'coldStart',
        'estimate',
        'estimates',
        'route',
        ({estimate, estimates, route}, cbk) =>
      {
        // Exit early when there is nothing to bridge to
        if (!route) {
          return cbk();
        }

        const {latest, target} = route;

        const nearest = nearestEstimate({estimates, latest, day: target});

        // Exit early when there is no complete day to bridge from
        if (!nearest.estimate) {
          return cbk();
        }

        // A complete day is reached when its neighbor has an estimate, and
        // the latest complete day when it has an estimate itself
        const reach = !!route.is_complete ? 1 : 0;

        // Every step brings the nearest estimate a day closer to the target
        const steps = max(Number(), nearest.estimate.distance - reach);

        return asyncTimesSeries(steps, (i, cbk) => {
          const {estimate: guide} = nearestEstimate({
            estimates,
            latest,
            day: target,
          });

          const days = guide.day < target ? 1 : yesterday;

          const next = addDays({days, day: guide.day}).day;

          // The latest complete day keeps its blocks from the start
          const blocks = next === route.latest ? dayBlocks : undefined;

          return estimate({blocks, day: next, is_sample: true}, (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            // An undetermined latest complete day leaves the day before it
            // to guide the provisional price, as it did before the bridge
            // reached the latest complete day itself
            if (!res.is_supported && !route.is_complete && next === target) {
              return cbk();
            }

            if (!res.is_supported) {
              return cbk([503, 'FailedToFindSupportedPriceToBridgeDay', {
                day: next,
              }]);
            }

            return cbk();
          });
        },
        cbk);
      }],

      // Estimate a complete day that has no price yet
      estimateDay: [
        'bridge',
        'day',
        'estimate',
        'estimates',
        'getBlocks',
        'reuse',
        ({day, estimate, estimates, getBlocks, reuse}, cbk) =>
      {
        // Exit early when the price is known or reused, or the day is not over
        if (!!estimates.rates[day] || !!reuse || !getBlocks.is_complete) {
          return cbk();
        }

        return estimate({day, blocks: dayBlocks, is_sample: false}, cbk);
      }],

      // The price for the day, or that it needs a provisional price
      getPrice: [
        'day',
        'estimateDay',
        'estimates',
        'reuse',
        ({day, estimateDay, estimates, reuse}, cbk) =>
      {
        // Exit early when the data do not support the price of a complete day
        if (!!estimateDay && !estimateDay.is_supported) {
          return cbk([503, 'FailedToFindSupportedPrice', {day}]);
        }

        // Exit early when a complete day was priced from its blocks
        if (!!estimateDay) {
          return cbk(null, {cents: estimateDay.cents});
        }

        // Exit early when the price is known
        if (!!estimates.rates[day]) {
          return cbk(null, {cents: estimates.rates[day].cents});
        }

        // Exit early when a recent provisional price is reused
        if (!!reuse) {
          return cbk(null, reuse);
        }

        // The day is not over yet and needs a provisional price
        return cbk(null, {is_provisional: true});
      }],

      // The blocks to use for a provisional price
      provisionalBlocks: [
        'getBlocks',
        'getPrice',
        ({getBlocks, getPrice}, cbk) =>
      {
        // Exit early when there is no provisional price to derive
        if (!getPrice.is_provisional || !!getPrice.cents) {
          return cbk();
        }

        const end = args.height - confirmationsAfterDay + 1;

        // The confirmed blocks of the day so far
        const confirmed = getBlocks.heights.filter(height => height < end);

        const first = !confirmed.length ? end : confirmed[Number()];
        const missing = minProvisionalBlocks - confirmed.length;

        // Pad with the blocks before the day when the day has just begun
        const start = max(Number(), first - max(Number(), missing));

        return cbk(null, range(start, first).concat(confirmed));
      }],

      // Derive a provisional price for an incomplete day
      provisional: [
        'day',
        'estimates',
        'getPrice',
        'provisionalBlocks',
        ({day, estimates, getPrice, provisionalBlocks}, cbk) =>
      {
        // Exit early when there is no provisional price to derive
        if (!provisionalBlocks) {
          return cbk(null, getPrice);
        }

        return getProvisionalPrice({
          day,
          estimates,
          heights: provisionalBlocks,
          lnd: args.lnd,
          logger: args.logger,
          put_price: args.put_price,
        },
        cbk);
      }],

      // Final price
      price: ['provisional', ({provisional}, cbk) => {
        return cbk(null, {
          cents: provisional.cents,
          is_provisional: !!provisional.is_provisional,
        });
      }],
    },
    returnResult({reject, resolve, of: 'price'}, cbk));
  });
};
