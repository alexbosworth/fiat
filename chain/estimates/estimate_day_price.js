const asyncAuto = require('async/auto');
const asyncTimesSeries = require('async/timesSeries');
const {returnResult} = require('asyncjs-util');

const estimateWindows = require('./estimate_windows');
const {getBlockHash} = require('./../blocks');
const {getBlocksForDate} = require('./../blocks');
const getPriceFromBlocks = require('./get_price_from_blocks');
const {isCalendarDay} = require('./../../dates');
const isSupportedEstimate = require('./is_supported_estimate');
const {sampleHeights} = require('./../blocks');
const {unpricedErrors} = require('./../constants');

const {assign} = Object;
const {ceil} = Math;
const isHeight = n => Number.isInteger(n) && n >= 0;
const {log2} = Math;
const {max} = Math;
const {min} = Math;
const minSamplePayments = 500;
const minWindowsBlocks = 24;
const {pow} = Math;
const sampleBlocksCount = 12;

/** Estimate the USD price of BTC on a complete day

  {
    [blocks]: <Retrieved Blocks By Height Map Object>
    date: <Day YYYY-MM-DD String>
    height: <Current Best Chain Height Number>
    [is_capping_near_round]: <Cap Values Just Off Round BTC Amounts Too Bool>
    [is_sample]: <Estimate From A Sample of the Blocks Bool>
    lnd: <Authenticated LND API Object>
    [logger]: <Winston Logger Object>
    [max_price]: <Maximum Possible USD Price Number>
    [min_price]: <Minimum Possible USD Price Number>
    [times]: <Block Times By Height Map Object>
  }

  @returns via cbk or Promise
  {
    [agreement]: <Spike Strengths Agreement With Template Weights Number>
    blocks: [<First Block Height Number>, <Last Block Height Number>]
    [cents]: <USD Cents Per BTC Number>
    [confidence]: <Best Position Score Over Best Alias Position Score Number>
    [coverage]: <Share of Spike Excess At Round USD Positions Number>
    [dispersion]: <Peak Width Beyond Smoothing As Price Fraction Number>
    [drift]: <Second Half Price Change From First Half Price Number>
    [evidence]: <Share of Prior Weight Observable At the Price Number>
    hash: <Last Block Hash Hex String>
    is_supported: <Estimate Is Supported By the Data Bool>
    [is_unpriced]: <Blocks Give No Price At All Bool>
    [is_unsettled]: <Refinement Was Still Moving After Its Last Pass Bool>
    [is_widened]: <Search Was Widened Beyond the Price Window Bool>
    [outputs]: <Payment Outputs Considered Count Number>
    [payments]: <Estimated Round USD Payments Count Number>
    [rivalry]: <Best Patterned Rival Position Score Over Best Score Number>
    [round_shift]: <Price Change If Round BTC Values Were Counted Number>
    [sample_blocks]: <Blocks In the Sample Count Number>
    [significance]: <Payment Peak Beyond Noise In Standard Deviations Number>
    [spikes]: [{
      strength: <Spike Strength Relative to the Strongest Spike Number>
      usd: <Round USD Amount Number>
    }]
    [stability]: <Largest Price Change From Perturbed Refinement Number>
    [windows]: [{
      blocks: [<First Block Height Number>, <Last Block Height Number>]
      [cents]: <USD Cents Per BTC Number>
      is_supported: <Window Price Is Supported By the Data Bool>
      [is_widened]: <Search Was Widened Beyond the Price Window Bool>
      seconds: <Time Covered By the Window Seconds Number>
    }]
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isCalendarDay({day: args.date}).is_calendar_day) {
          return cbk([400, 'ExpectedYyyyMmDdDateToEstimateDayPrice']);
        }

        if (!isHeight(args.height)) {
          return cbk([400, 'ExpectedCurrentChainHeightToEstimateDayPrice']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToEstimateDayPrice']);
        }

        return cbk();
      },

      // Blocks are kept so that each one is retrieved once for all estimates
      blocks: ['validate', ({}, cbk) => cbk(null, args.blocks || new Map())],

      // Block times are kept to avoid retrieving them twice
      times: ['validate', ({}, cbk) => cbk(null, args.times || new Map())],

      // Get the blocks on the day
      getBlocks: ['times', ({times}, cbk) => {
        return getBlocksForDate({
          times,
          date: args.date,
          height: args.height,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Only a complete day is estimated
      checkComplete: ['getBlocks', ({getBlocks}, cbk) => {
        if (!getBlocks.is_complete) {
          return cbk([503, 'ExpectedCompleteDayToEstimateDayPrice']);
        }

        return cbk();
      }],

      // Get the hash of the last block on the day
      getHash: ['checkComplete', 'getBlocks', ({getBlocks}, cbk) => {
        const {heights} = getBlocks;

        return getBlockHash({
          height: heights[heights.length - 1],
          lnd: args.lnd,
        },
        cbk);
      }],

      // Derive the price from the blocks on the day
      getPrice: [
        'blocks',
        'checkComplete',
        'getBlocks',
        ({blocks, getBlocks}, cbk) =>
      {
        const {heights} = getBlocks;

        // Exit early when using all of the blocks on the day
        if (!args.is_sample) {
          return getPriceFromBlocks({
            blocks,
            heights,
            date: args.date,
            is_capping_near_round: args.is_capping_near_round,
            lnd: args.lnd,
            logger: args.logger,
            max_price: args.max_price,
            min_price: args.min_price,
          },
          (err, res) => {
            // Exit early when the blocks give no price at all
            if (!!err && unpricedErrors.includes(err[1])) {
              return cbk(null, {is_unpriced: true});
            }

            return cbk(err, res);
          });
        }

        const estimates = [];

        // Each attempt doubles the sample size up to all the blocks
        const doublings = ceil(log2(heights.length / sampleBlocksCount));

        const attempts = max(1, doublings + 1);

        return asyncTimesSeries(attempts, (i, cbk) => {
          const [latest] = estimates;

          // Exit early when the sample already supports the price well
          if (!!latest && latest.is_enough) {
            return cbk();
          }

          // Exit early when all the blocks were already sampled
          if (!!latest && latest.count >= heights.length) {
            return cbk();
          }

          const count = sampleBlocksCount * pow(2, i);

          // Only a sample that is expanded to the whole day shows progress
          const logger = count >= heights.length ? args.logger : undefined;

          // A doubled sample keeps the blocks of the smaller samples
          const sample = sampleHeights({
            count,
            heights,
            initial: sampleBlocksCount,
          });

          return getPriceFromBlocks({
            blocks,
            logger,
            date: args.date,
            heights: sample.heights,
            is_capping_near_round: args.is_capping_near_round,
            lnd: args.lnd,
            max_price: args.max_price,
            min_price: args.min_price,
          },
          (err, res) => {
            // A sample whose blocks give no price at all is not supported
            if (!!err && unpricedErrors.includes(err[1])) {
              estimates.unshift({count, price: {is_unpriced: true}});

              return cbk();
            }

            if (!!err) {
              return cbk(err);
            }

            const hasPayments = res.payments >= minSamplePayments;

            const support = isSupportedEstimate({
              confidence: res.confidence,
              evidence: res.evidence,
              is_unconstrained: !args.min_price || !!res.is_widened,
              payments: res.payments,
              rivalry: res.rivalry,
              significance: res.significance,
              spikes: res.spikes,
              stability: res.stability,
            });

            estimates.unshift({
              count,
              is_enough: support.is_supported && hasPayments,
              price: res,
            });

            return cbk();
          });
        },
        err => {
          if (!!err) {
            return cbk(err);
          }

          const [latest] = estimates;

          // A sample that was expanded to the whole day used all its blocks
          const sampled = min(latest.count, heights.length);

          return cbk(null, assign({}, latest.price, {
            sample_blocks: sampled,
          }));
        });
      }],

      // Determine if the data support the price of the day as a whole
      isSupported: ['getPrice', ({getPrice}, cbk) => {
        // Exit early when the blocks gave no price at all
        if (!!getPrice.is_unpriced) {
          return cbk(null, false);
        }

        return cbk(null, isSupportedEstimate({
          confidence: getPrice.confidence,
          evidence: getPrice.evidence,
          is_unconstrained: !args.min_price || !!getPrice.is_widened,
          payments: getPrice.payments,
          rivalry: getPrice.rivalry,
          significance: getPrice.significance,
          spikes: getPrice.spikes,
          stability: getPrice.stability,
        }).is_supported);
      }],

      // Estimate a full day in windows, and a sample that is not supported
      getWindows: [
        'blocks',
        'getBlocks',
        'getPrice',
        'isSupported',
        'times',
        ({blocks, getBlocks, getPrice, isSupported, times}, cbk) =>
      {
        const {heights} = getBlocks;

        // Exit early when a sample is supported, since it only bridges
        if (!!args.is_sample && !!isSupported) {
          return cbk();
        }

        // Exit early when the blocks of the day gave no price at all
        if (!!getPrice.is_unpriced) {
          return cbk();
        }

        // Exit early when the estimate did not use every block on the day
        if (getPrice.sample_blocks < heights.length) {
          return cbk();
        }

        // Exit early when the day is too short to split into windows
        if (heights.length < minWindowsBlocks) {
          return cbk();
        }

        return estimateWindows({
          blocks,
          heights,
          times,
          is_capping_near_round: args.is_capping_near_round,
          lnd: args.lnd,
          max_price: args.max_price,
          min_price: args.min_price,
        },
        cbk);
      }],

      // The estimated price for the day
      price: [
        'getBlocks',
        'getHash',
        'getPrice',
        'getWindows',
        'isSupported',
        ({getBlocks, getHash, getPrice, getWindows, isSupported}, cbk) =>
      {
        const {heights} = getBlocks;

        const isWindowed = !!getWindows && getWindows.is_supported;

        // A day priced from its windows takes the measures of the windows
        const price = isWindowed ? getWindows : getPrice;

        return cbk(null, {
          agreement: price.agreement,
          blocks: [heights[Number()], heights[heights.length - 1]],
          cents: price.cents,
          confidence: price.confidence,
          coverage: price.coverage,
          dispersion: price.dispersion,
          drift: price.drift,
          evidence: price.evidence,
          hash: getHash.hash,
          is_supported: isSupported || isWindowed,
          is_unpriced: getPrice.is_unpriced,
          is_unsettled: price.is_unsettled,
          is_widened: price.is_widened,
          outputs: price.outputs,
          payments: price.payments,
          rivalry: price.rivalry,
          round_shift: price.round_shift,
          sample_blocks: getPrice.sample_blocks,
          significance: price.significance,
          spikes: price.spikes,
          stability: price.stability,
          windows: !getWindows ? undefined : getWindows.windows,
        });
      }],
    },
    returnResult({reject, resolve, of: 'price'}, cbk));
  });
};
