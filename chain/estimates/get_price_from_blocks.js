const asyncAuto = require('async/auto');
const asyncMapLimit = require('async/mapLimit');
const {returnResult} = require('asyncjs-util');

const {centsPerDollar} = require('./../constants');
const {defaultMaxPrice} = require('./../constants');
const {defaultMinPrice} = require('./../constants');
const {estimateFromOutputs} = require('./../outputs');
const {fetchLimit} = require('./../constants');
const {getBlockPayments} = require('./../blocks');
const {minAliasMargin} = require('./../constants');
const {priceFromOutputs} = require('./../outputs');

const {assign} = Object;
const driftReach = 1.09;
const flatten = arr => [].concat(...arr);
const {floor} = Math;
const {isArray} = Array;
const isHeight = n => Number.isInteger(n) && n >= 0;
const logInterval = 24;
const {max} = Math;
const {min} = Math;
const minDriftBlocks = 24;
const widening = 2;

/** Get the USD price of BTC implied by the payments in a set of blocks

  {
    [blocks]: <Retrieved Blocks By Height Map Object>
    [date]: <Day the Blocks Are On YYYY-MM-DD String>
    heights: [<Block Height Number>]
    [is_capping_near_round]: <Cap Values Just Off Round BTC Amounts Too Bool>
    lnd: <Authenticated LND API Object>
    [logger]: <Winston Logger Object>
    [max_price]: <Maximum Possible USD Price Number>
    [min_price]: <Minimum Possible USD Price Number>
  }

  @returns via cbk or Promise
  {
    agreement: <Spike Strengths Agreement With Prior Weights Number>
    cents: <USD Cents Per BTC Number>
    confidence: <Best Position Score Over Best Patterned Alias Score Number>
    coverage: <Share of Spike Excess At Round USD Positions Number>
    dispersion: <Peak Width Beyond Smoothing As Price Fraction Number>
    [drift]: <Second Half Price Change From First Half Price Number>
    evidence: <Share of Prior Weight Observable At the Price Number>
    [is_unsettled]: <Refinement Was Still Moving After Its Last Pass Bool>
    [is_widened]: <Search Was Widened Beyond the Price Window Bool>
    outputs: <Payment Outputs Considered Count Number>
    payments: <Estimated Round USD Payments Count Number>
    rivalry: <Best Patterned Rival Position Score Over Best Score Number>
    rough_cents: <Rough Estimate USD Cents Per BTC Number>
    round_shift: <Price Change If Round BTC Values Were Counted Number>
    significance: <Payment Peak Beyond Noise In Standard Deviations Number>
    spikes: [{
      strength: <Spike Strength Relative to the Strongest Spike Number>
      usd: <Round USD Amount Number>
    }]
    stability: <Largest Price Change From Perturbed Refinement Number>
    transactions: <Payment Transactions Considered Count Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isArray(args.heights) || !args.heights.length) {
          return cbk([400, 'ExpectedBlockHeightsToGetPriceFromBlocks']);
        }

        if (!args.heights.every(isHeight)) {
          return cbk([400, 'ExpectedBlockHeightNumbersToGetPriceFromBlocks']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetPriceFromBlocks']);
        }

        return cbk();
      },

      // Get the blocks and pull out the payment-like outputs
      getBlocks: ['validate', ({}, cbk) => {
        const heights = args.heights.slice().sort((a, b) => a - b);
        const progress = {fetched: Number()};

        const total = heights.length;

        // Log the progress of fetching blocks like a progress bar
        const log = fetched => {
          // Exit early when there is no logger or the fetch is a short one
          if (!args.logger || total < logInterval) {
            return;
          }

          // Exit early when the progress is between marks
          if (!!(fetched % logInterval) && fetched !== total) {
            return;
          }

          return args.logger.info({
            fetching_blocks: {date: args.date, blocks: `${fetched}/${total}`},
          });
        };

        log(progress.fetched);

        return asyncMapLimit(heights, fetchLimit, (height, cbk) => {
          return getBlockPayments({
            height,
            blocks: args.blocks,
            lnd: args.lnd,
          },
          (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            log(++progress.fetched);

            return cbk(null, res);
          });
        },
        cbk);
      }],

      // Collect the payment outputs of every block
      payments: ['getBlocks', ({getBlocks}, cbk) => {
        const payments = getBlocks.map(block => block.outputs);

        if (!flatten(payments).length) {
          return cbk([503, 'ExpectedPaymentOutputsInBlocksToGetPrice']);
        }

        return cbk(null, payments);
      }],

      // Count the payment transactions
      transactions: ['getBlocks', ({getBlocks}, cbk) => {
        return cbk(null, getBlocks.reduce((sum, block) => {
          return sum + block.transactions;
        },
        Number()));
      }],

      // Derive the price from the payment output values
      price: ['payments', ({payments}, cbk) => {
        const derived = (() => {
          try {
            return {
              price: priceFromOutputs({
                is_capping_near_round: args.is_capping_near_round,
                max_price: args.max_price,
                min_price: args.min_price,
                outputs: flatten(payments),
              }),
            };
          } catch (err) {
            return {err};
          }
        })();

        // Exit early when the outputs cannot be priced
        if (!!derived.err) {
          return cbk([503, 'FailedToDerivePriceFromOutputs', {
            err: derived.err,
          }]);
        }

        return cbk(null, derived.price);
      }],

      // Widen the search when the price does not fit well in the window
      widen: ['payments', 'price', ({payments, price}, cbk) => {
        // Exit early when there is no window to widen
        if (!args.max_price || !args.min_price) {
          return cbk(null, price);
        }

        const isConflict = price.confidence < minAliasMargin;

        // Exit early when the price fits in the window
        if (!price.is_at_edge && !isConflict) {
          return cbk(null, price);
        }

        const maxPrice = min(defaultMaxPrice, args.max_price * widening);
        const minPrice = max(defaultMinPrice, args.min_price / widening);

        const widened = (() => {
          try {
            return {
              price: priceFromOutputs({
                is_capping_near_round: args.is_capping_near_round,
                max_price: maxPrice,
                min_price: minPrice,
                outputs: flatten(payments),
              }),
            };
          } catch (err) {
            return {err};
          }
        })();

        // Exit early when the outputs cannot be priced in the wider window
        if (!!widened.err) {
          return cbk([503, 'FailedToDerivePriceInWidenedWindow', {
            err: widened.err,
          }]);
        }

        return cbk(null, assign({is_widened: true}, widened.price));
      }],

      // Estimate the price in the first and second halves of the blocks
      drift: ['payments', 'widen', ({payments, widen}, cbk) => {
        // Exit early when there are too few blocks to split
        if (payments.length < minDriftBlocks) {
          return cbk();
        }

        const half = floor(payments.length / 2);
        const price = widen.cents / centsPerDollar;

        const halves = [payments.slice(Number(), half), payments.slice(half)];

        const drift = (() => {
          try {
            const [first, second] = halves.map(blocks => estimateFromOutputs({
              is_capping_near_round: args.is_capping_near_round,
              is_quick: true,
              max_price: price * driftReach,
              min_price: price / driftReach,
              outputs: flatten(blocks),
            }));

            return {drift: second.cents / first.cents - 1};
          } catch (err) {
            // A half without enough payments to price does not show a drift
            return {};
          }
        })();

        return cbk(null, drift);
      }],

      // The derived price
      result: [
        'drift',
        'payments',
        'transactions',
        'widen',
        ({drift, payments, transactions, widen}, cbk) =>
      {
        return cbk(null, {
          transactions,
          agreement: widen.agreement,
          cents: widen.cents,
          confidence: widen.confidence,
          coverage: widen.coverage,
          dispersion: widen.dispersion,
          drift: !drift ? undefined : drift.drift,
          evidence: widen.evidence,
          is_unsettled: widen.is_unsettled,
          is_widened: widen.is_widened,
          outputs: flatten(payments).length,
          payments: widen.payments,
          rivalry: widen.rivalry,
          rough_cents: widen.rough_cents,
          round_shift: widen.round_shift,
          significance: widen.significance,
          spikes: widen.spikes,
          stability: widen.stability,
        });
      }],
    },
    returnResult({reject, resolve, of: 'result'}, cbk));
  });
};
