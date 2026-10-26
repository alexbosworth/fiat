const asyncAuto = require('async/auto');
const asyncMapSeries = require('async/mapSeries');
const {returnResult} = require('asyncjs-util');

const {getMedianTime} = require('./../blocks');
const getPriceFromBlocks = require('./get_price_from_blocks');
const {half} = require('./../constants');
const isSupportedEstimate = require('./is_supported_estimate');
const {sortBy} = require('./../../arrays');
const {unpricedErrors} = require('./../constants');
const {windowHeights} = require('./../blocks');

const {isArray} = Array;
const isHeight = n => Number.isInteger(n) && n >= 0;
const {isInteger} = Number;
const {max} = Math;
const sum = arr => arr.reduce((sum, n) => sum + n, Number());
const windowBlocksCount = 12;

/** Estimate the USD price of BTC on a day from windows of its blocks

  {
    blocks: <Retrieved Blocks By Height Map Object>
    heights: [<Block Height Number>]
    [is_capping_near_round]: <Cap Values Just Off Round BTC Amounts Too Bool>
    lnd: <Authenticated LND API Object>
    [max_price]: <Maximum Possible USD Price Number>
    [min_price]: <Minimum Possible USD Price Number>
    times: <Block Times By Height Map Object>
  }

  @returns via cbk or Promise
  {
    [agreement]: <Spike Strengths Agreement With Template Weights Number>
    [cents]: <USD Cents Per BTC Number>
    [confidence]: <Best Position Score Over Best Alias Position Score Number>
    [coverage]: <Share of Spike Excess At Round USD Positions Number>
    [dispersion]: <Peak Width Beyond Smoothing As Price Fraction Number>
    [evidence]: <Share of Prior Weight Observable At the Price Number>
    is_supported: <Supported Windows Cover Enough of the Day Bool>
    [is_unsettled]: <Refinement Was Still Moving After Its Last Pass Bool>
    [outputs]: <Payment Outputs Considered Count Number>
    [payments]: <Estimated Round USD Payments Count Number>
    [rivalry]: <Best Patterned Rival Position Score Over Best Score Number>
    [round_shift]: <Price Change If Round BTC Values Were Counted Number>
    [significance]: <Payment Peak Beyond Noise In Standard Deviations Number>
    [spikes]: [{
      strength: <Spike Strength Relative to the Strongest Spike Number>
      usd: <Round USD Amount Number>
    }]
    [stability]: <Largest Price Change From Perturbed Refinement Number>
    windows: [{
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
        if (!args.blocks) {
          return cbk([400, 'ExpectedRetrievedBlocksMapToEstimateWindows']);
        }

        if (!isArray(args.heights) || !args.heights.length) {
          return cbk([400, 'ExpectedBlockHeightsToEstimateWindows']);
        }

        if (!args.heights.every(isHeight)) {
          return cbk([400, 'ExpectedBlockHeightNumbersToEstimateWindows']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToEstimateWindows']);
        }

        if (!args.times) {
          return cbk([400, 'ExpectedBlockTimesMapToEstimateWindows']);
        }

        return cbk();
      },

      // Split the blocks into windows
      windows: ['validate', ({}, cbk) => {
        const heights = args.heights.slice().sort((a, b) => a - b);

        return cbk(null, windowHeights({heights, count: windowBlocksCount}));
      }],

      // Estimate each window on its own
      estimates: ['windows', ({windows}, cbk) => {
        return asyncMapSeries(windows.windows, (heights, cbk) => {
          return getPriceFromBlocks({
            heights,
            blocks: args.blocks,
            is_capping_near_round: args.is_capping_near_round,
            lnd: args.lnd,
            max_price: args.max_price,
            min_price: args.min_price,
          },
          (err, res) => {
            // A window whose outputs cannot be priced is not supported
            if (!!err && unpricedErrors.includes(err[1])) {
              return cbk(null, {heights});
            }

            if (!!err) {
              return cbk(err);
            }

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

            return cbk(null, {
              heights,
              estimate: res,
              is_supported: support.is_supported,
            });
          });
        },
        cbk);
      }],

      // Get the median times past bounding the windows, from the block before
      getTimes: ['estimates', 'windows', ({windows}, cbk) => {
        const [[first]] = windows.windows;

        // The first block of the chain has no block before it
        const start = max(Number(), first - 1);

        const bounds = [start].concat(windows.windows.map(heights => {
          return heights[heights.length - 1];
        }));

        // The retrieved blocks already have their timestamps
        args.blocks.forEach((block, height) => {
          // Exit early when the time is known or the block has no time
          if (args.times.has(height) || !isInteger(block.time)) {
            return;
          }

          return args.times.set(height, block.time);
        });

        return asyncMapSeries(bounds, (height, cbk) => {
          return getMedianTime({
            height,
            lnd: args.lnd,
            times: args.times,
          },
          cbk);
        },
        cbk);
      }],

      // Price the day from the windows that are supported
      price: ['estimates', 'getTimes', ({estimates, getTimes}, cbk) => {
        // Each window covers the time since the end of the window before it
        const windows = estimates.map((window, index) => {
          const {estimate} = window;
          const [first] = window.heights;
          const [last] = window.heights.slice(-1);

          const elapsed = getTimes[index + 1].time - getTimes[index].time;

          // A window whose search had to be widened is not counted
          const isWidened = !!estimate && !!estimate.is_widened;

          return {
            estimate,
            blocks: [first, last],
            cents: !estimate ? undefined : estimate.cents,
            is_counted: !!window.is_supported && !isWidened,
            is_supported: !!window.is_supported,
            is_widened: isWidened || undefined,
            seconds: max(Number(), elapsed),
          };
        });

        const counted = windows.filter(n => n.is_counted);

        const coveredSeconds = sum(counted.map(n => n.seconds));
        const totalSeconds = sum(windows.map(n => n.seconds));

        const reported = windows.map(window => ({
          blocks: window.blocks,
          cents: window.cents,
          is_supported: window.is_supported,
          is_widened: window.is_widened,
          seconds: window.seconds,
        }));

        // Exit early when the supported windows cover too little of the day
        if (!totalSeconds || coveredSeconds < totalSeconds * half) {
          return cbk(null, {is_supported: false, windows: reported});
        }

        // The median is the price with half of the covered time below it
        const {sorted} = sortBy({array: counted, attribute: 'cents'});

        const below = sorted.map((window, position) => {
          return sum(sorted.slice(Number(), position + 1).map(n => n.seconds));
        });

        const middle = below.findIndex(n => n >= coveredSeconds * half);

        const {estimate} = sorted[middle];

        // Measures are the median window's, outputs and payments are totals
        return cbk(null, {
          agreement: estimate.agreement,
          cents: estimate.cents,
          confidence: estimate.confidence,
          coverage: estimate.coverage,
          dispersion: estimate.dispersion,
          evidence: estimate.evidence,
          is_supported: true,
          is_unsettled: estimate.is_unsettled,
          outputs: sum(counted.map(n => n.estimate.outputs)),
          payments: sum(counted.map(n => n.estimate.payments)),
          rivalry: estimate.rivalry,
          round_shift: estimate.round_shift,
          significance: estimate.significance,
          spikes: estimate.spikes,
          stability: estimate.stability,
          windows: reported,
        });
      }],
    },
    returnResult({reject, resolve, of: 'price'}, cbk));
  });
};
