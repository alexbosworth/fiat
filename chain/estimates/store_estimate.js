const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {centsPerDollar} = require('./../constants');
const currentEstimates = require('./current_estimates');
const {putPricesFile} = require('./../../storage');
const rememberEstimate = require('./remember_estimate');
const {sampleLogInterval} = require('./../constants');

const {assign} = Object;
const dollars = cents => (cents / centsPerDollar).toFixed(2);
const rounded = n => Math.round(n * 1e3) / 1e3;

/** Store a price estimate with the known estimates and in the prices file

  {
    estimate: {
      [agreement]: <Spike Strengths Agreement With Prior Weights Number>
      blocks: [<First Block Height Number>, <Last Block Height Number>]
      cents: <USD Cents Per BTC Number>
      [confidence]: <Best Position Score Over Best Alias Score Number>
      date: <Day YYYY-MM-DD String>
      [hash]: <Last Block Hash Hex String>
      [is_provisional]: <Price Is For An Incomplete Day Bool>
      [is_sample]: <Price Is A Rough Estimate From Sample Blocks Bool>
      [is_unguided]: <Price Was Estimated Without a Neighboring Guide Bool>
      [is_unsettled]: <Refinement Was Still Moving After Its Last Pass Bool>
      [is_widened]: <Search Was Widened Beyond the Price Window Bool>
      outputs: <Payment Outputs Considered Count Number>
      [payments]: <Estimated Round USD Payments Count Number>
      [rivalry]: <Best Rival Position Score Over Best Score Number>
      [dispersion]: <Peak Width Beyond Smoothing As Price Fraction Number>
      [drift]: <Second Half Price Change From First Half Price Number>
      [stability]: <Largest Price Change From Perturbed Refinement Number>
      [version]: <Method Version String>
    }
    estimates: {
      priors: {<Day YYYY-MM-DD String>: <Estimate Object>}
      provisional: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
      rates: {<Day YYYY-MM-DD String>: <Estimate Object>}
      samples: <Count of Sample Estimates Stored Number>
    }
    fs: {
      getFile: <Read File Contents Function> (path, cbk) => {}
      makeDirectory: <Make Directory Function> (path, cbk) => {}
      renameFile: <Rename File Function> (from, to, cbk) => {}
      writeFile: <Write File Contents Function> (path, contents, cbk) => {}
    }
    [logger]: <Winston Logger Object>
    path: <Prices File Path String>
  }

  @returns via cbk or Promise
*/
module.exports = ({estimate, estimates, fs, logger, path}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!estimate) {
          return cbk([400, 'ExpectedEstimateToStoreEstimate']);
        }

        if (!estimates) {
          return cbk([400, 'ExpectedKnownEstimatesToStoreEstimate']);
        }

        if (!fs) {
          return cbk([400, 'ExpectedFileSystemMethodsToStoreEstimate']);
        }

        if (!path) {
          return cbk([400, 'ExpectedPricesFilePathToStoreEstimate']);
        }

        return cbk();
      },

      // Log the estimate
      log: ['validate', ({}, cbk) => {
        const {blocks, cents, date, drift, outputs, payments} = estimate;

        // Exit early when there is no logger
        if (!logger) {
          return cbk();
        }

        const price = dollars(cents);
        const widened = estimate.is_widened || undefined;

        if (!!estimate.is_provisional) {
          logger.info({
            chain_price: {
              date,
              price,
              is_provisional: true,
              is_widened: widened,
            },
          });

          return cbk();
        }

        if (!!estimate.is_sample) {
          estimates.samples++;

          if (!(estimates.samples % sampleLogInterval) || !!widened) {
            logger.info({
              chain_price: {
                date,
                price,
                is_sample: true,
                is_widened: widened,
              },
            });
          }

          return cbk();
        }

        // A full day price estimated without a guide is a starting point
        if (!!estimate.is_unguided) {
          logger.info({chain_price: {starting_from: date}});
        }

        logger.info({
          chain_price: {
            date,
            outputs,
            payments,
            price,
            agreement: rounded(estimate.agreement),
            blocks: blocks[1] - blocks[0] + 1,
            confidence: rounded(estimate.confidence),
            dispersion: rounded(estimate.dispersion),
            drift: estimate.drift === undefined ? undefined : rounded(drift),
            is_unsettled: estimate.is_unsettled || undefined,
            is_widened: widened,
            rivalry: rounded(estimate.rivalry),
            stability: rounded(estimate.stability),
          },
        });

        return cbk();
      }],

      // The known estimates with the estimate, kept apart until it is stored
      remember: ['log', ({}, cbk) => {
        const updated = {
          priors: assign({}, estimates.priors),
          provisional: assign({}, estimates.provisional),
          rates: assign({}, estimates.rates),
        };

        return cbk(null, rememberEstimate({estimate, estimates: updated}));
      }],

      // Write the estimate to the prices file
      write: ['remember', ({remember}, cbk) => {
        return putPricesFile({
          fs,
          path,
          priors: remember.estimates.priors,
          provisional: remember.estimates.provisional,
          rates: remember.estimates.rates,
        },
        cbk);
      }],

      // Keep the current prices that are now in the file
      update: ['remember', 'write', ({remember, write}, cbk) => {
        // Prices in the file from other versions of the method are not used
        const current = currentEstimates({
          priors: write.priors,
          provisional: write.provisional,
          rates: write.rates,
        });

        estimates.priors = current.priors;
        estimates.provisional = current.provisional;
        estimates.rates = current.rates;

        // Exit early when the estimate is not a provisional price
        if (!estimate.is_provisional) {
          return cbk();
        }

        // A later provisional price in the file may not be usable here
        const {date} = estimate;

        estimates.provisional[date] = remember.estimates.provisional[date];

        return cbk();
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
