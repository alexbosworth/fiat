const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {estimateDayPrice} = require('./../../chain/estimates');
const {estimateRecord} = require('./../../chain/estimates');
const {isAliasRatio} = require('./../../chain/estimates');
const {priceWindow} = require('./../../chain/estimates');

const {assign} = Object;

/** Estimate a date from the blocks of its own day

  {
    date: <Day YYYY-MM-DD String>
    [guide]: {
      cents: <Reference USD Cents Per BTC Guiding the Search Number>
      day: <Day of the Guiding Reference Price YYYY-MM-DD String>
    }
    height: <Current Best Chain Height Number>
    [is_capping_near_round]: <Cap Values Just Off Round BTC Amounts Bool>
    [is_sampled]: <Estimate From a Sample of Blocks Bool>
    lnd: <Authenticated LND API Object>
    [logger]: <Winston Logger Object>
    times: <Block Times Map Object>
  }

  @returns via cbk or Promise
  {
    derived: {
      [cents]: <Derived USD Cents Per BTC Number>
      [error]: <Derivation Error Array>
      [is_conflict]: <Supported Price Is At An Alias Ratio of Its Guide Bool>
      [is_supported]: <Derived Price Is Supported By the Data Bool>
      [is_widened]: <Search Was Widened Beyond the Guide Window Bool>
      [payments]: <Estimated Round USD Payments Count Number>
      [sample_blocks]: <Blocks In the Sample Count Number>
      [windows]: [<Window Estimate Object>]
    }
    [record]: <Estimate Record Object>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Estimate the price of the day from its own blocks
      getEstimate: cbk => {
        const {guide} = args;

        const bounds = !guide ? {} : priceWindow({cents: guide.cents});

        return estimateDayPrice({
          date: args.date,
          height: args.height,
          is_capping_near_round: args.is_capping_near_round,
          is_sample: args.is_sampled,
          lnd: args.lnd,
          logger: args.logger,
          max_price: bounds.max_price,
          min_price: bounds.min_price,
          times: args.times,
        },
        (err, res) => {
          // A date that cannot be estimated is reported, not fatal
          if (!!err) {
            return cbk(null, {error: err});
          }

          // A date whose blocks give no price at all is reported the same way
          if (!!res.is_unpriced) {
            return cbk(null, {
              error: [503, 'FoundNoPriceInBlocksOfDay', {day: args.date}],
            });
          }

          return cbk(null, {estimate: res});
        });
      },

      // Describe the estimate
      estimate: ['getEstimate', ({getEstimate}, cbk) => {
        // Exit early when the date could not be estimated
        if (!!getEstimate.error) {
          return cbk(null, {derived: {error: getEstimate.error}});
        }

        const {estimate} = getEstimate;

        const {record} = estimateRecord({
          estimate,
          date: args.date,
          is_sample: args.is_sampled,
        });

        record.is_supported = estimate.is_supported;

        const derived = {
          cents: estimate.cents,
          is_supported: estimate.is_supported,
          is_widened: estimate.is_widened,
          payments: estimate.payments,
          sample_blocks: estimate.sample_blocks,
          windows: estimate.windows,
        };

        // Exit early when the price was found inside the window, if any
        if (!estimate.is_widened) {
          return cbk(null, {derived, record});
        }

        const ratio = isAliasRatio({
          cents: estimate.cents,
          other: args.guide.cents,
        });

        // A supported price widened to an alias of its guide is refused
        const isConflict = !!estimate.is_supported && ratio.is_alias;

        return cbk(null, {
          record,
          derived: assign({}, derived, {is_conflict: isConflict || undefined}),
        });
      }],
    },
    returnResult({reject, resolve, of: 'estimate'}, cbk));
  });
};
