const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const estimateRecord = require('./estimate_record');
const {getBlockHash} = require('./../blocks');
const getPriceFromBlocks = require('./get_price_from_blocks');
const isAliasRatio = require('./is_alias_ratio');
const isSupportedEstimate = require('./is_supported_estimate');
const nearestEstimate = require('./nearest_estimate');
const priceWindow = require('./price_window');
const rememberEstimate = require('./remember_estimate');
const {unpricedErrors} = require('./../constants');

/** Derive and remember a provisional price for an incomplete day

  {
    day: <Day YYYY-MM-DD String>
    estimates: {
      priors: {<Day YYYY-MM-DD String>: <Estimate Object>}
      provisional: {<Day YYYY-MM-DD String>: <Estimate Object>}
      rates: {<Day YYYY-MM-DD String>: <Estimate Object>}
    }
    heights: [<Block Height Number>]
    lnd: <Authenticated LND API Object>
    [logger]: <Winston Logger Object>
    put_price: <Remember Price Function> (record, cbk) => (err)
  }

  @returns via cbk or Promise
  {
    cents: <USD Cents Per BTC Number>
    is_provisional: <Price Is Provisional Bool>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // The nearest estimate guides the search
      guide: cbk => {
        const {estimate} = nearestEstimate({
          day: args.day,
          estimates: args.estimates,
        });

        return cbk(null, {estimate});
      },

      // Derive the price from the blocks
      getPrice: ['guide', ({guide}, cbk) => {
        const {estimate} = guide;

        const bounds = !estimate ? {} : priceWindow({cents: estimate.cents});

        return getPriceFromBlocks({
          date: args.day,
          heights: args.heights,
          lnd: args.lnd,
          logger: args.logger,
          max_price: bounds.max_price,
          min_price: bounds.min_price,
        },
        (err, res) => {
          // Exit early when the blocks give no price at all
          if (!!err && unpricedErrors.includes(err[1])) {
            return cbk([503, 'FailedToFindSupportedProvisionalPrice', {
              day: args.day,
            }]);
          }

          return cbk(err, res);
        });
      }],

      // Check that the data support the price
      checkPrice: ['getPrice', 'guide', ({getPrice, guide}, cbk) => {
        const {estimate} = guide;

        const support = isSupportedEstimate({
          confidence: getPrice.confidence,
          evidence: getPrice.evidence,
          is_unconstrained: !estimate || !!getPrice.is_widened,
          payments: getPrice.payments,
          rivalry: getPrice.rivalry,
          significance: getPrice.significance,
          spikes: getPrice.spikes,
          stability: getPrice.stability,
        });

        if (!support.is_supported) {
          return cbk([503, 'FailedToFindSupportedProvisionalPrice', {
            day: args.day,
          }]);
        }

        // Exit early when the price was not found beyond a guide window
        if (!getPrice.is_widened || !estimate) {
          return cbk();
        }

        const ratio = isAliasRatio({
          cents: getPrice.cents,
          other: estimate.cents,
        });

        // A price at an alias of its guide means one of them is wrong
        if (!!ratio.is_alias) {
          return cbk([503, 'FoundProvisionalPriceAtAliasOfGuidePrice', {
            cents: getPrice.cents,
            day: args.day,
            neighbor: estimate.day,
            neighbor_cents: estimate.cents,
          }]);
        }

        return cbk();
      }],

      // Get the hash of the last block
      getHash: ['checkPrice', ({}, cbk) => {
        const [last] = args.heights.slice(-1);

        return getBlockHash({height: last, lnd: args.lnd}, cbk);
      }],

      // Remember the provisional price
      remember: ['getHash', 'getPrice', ({getHash, getPrice}, cbk) => {
        const [first] = args.heights;
        const [last] = args.heights.slice(-1);

        const {record} = estimateRecord({
          date: args.day,
          estimate: {
            agreement: getPrice.agreement,
            blocks: [first, last],
            cents: getPrice.cents,
            confidence: getPrice.confidence,
            coverage: getPrice.coverage,
            dispersion: getPrice.dispersion,
            drift: getPrice.drift,
            evidence: getPrice.evidence,
            hash: getHash.hash,
            is_widened: getPrice.is_widened,
            outputs: getPrice.outputs,
            payments: getPrice.payments,
            rivalry: getPrice.rivalry,
            round_shift: getPrice.round_shift,
            significance: getPrice.significance,
            spikes: getPrice.spikes,
            stability: getPrice.stability,
          },
          is_provisional: true,
        });

        rememberEstimate({estimate: record, estimates: args.estimates});

        return args.put_price(record, err => {
          return cbk(err, {cents: getPrice.cents, is_provisional: true});
        });
      }],
    },
    returnResult({reject, resolve, of: 'remember'}, cbk));
  });
};
