const asyncAuto = require('async/auto');
const {getHeight} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const currentEstimates = require('./current_estimates');
const {dayOfDate} = require('./../../dates');
const forgetEstimates = require('./forget_estimates');
const getPriceForDate = require('./get_price_for_date');
const {getPricesFile} = require('./../../storage');
const storeEstimate = require('./store_estimate');

const {assign} = Object;

/** Get the USD price of BTC on a date derived from chain data

  {
    date: <Day YYYY-MM-DD String>
    estimates: {
      [priors]: {<Day YYYY-MM-DD String>: <Estimate Object>}
      provisional: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
      [rates]: {<Day YYYY-MM-DD String>: <Estimate Object>}
      samples: <Count of Sample Estimates Stored Number>
    }
    fs: {
      getFile: <Read File Contents Function> (path, cbk) => {}
      makeDirectory: <Make Directory Function> (path, cbk) => {}
      renameFile: <Rename File Function> (from, to, cbk) => {}
      writeFile: <Write File Contents Function> (path, contents, cbk) => {}
    }
    [known]: {
      <Day YYYY-MM-DD String>: {
        cents: <USD Cents Per BTC Number>
        version: <Method Version String>
      }
    }
    lnd: <Authenticated LND API Object>
    [logger]: <Winston Logger Object>
    path: <Prices File Path String>
    [unsupported]: <Unsupported Estimates Map Object>
  }

  @returns via cbk or Promise
  {
    cents: <USD Cents Per BTC Number>
  }
*/
module.exports = (args, cbk) => {
  const {date, estimates, fs, lnd, logger, path, unsupported} = args;

  const known = args.known || {};

  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!date) {
          return cbk([400, 'ExpectedDateToGetChainPrice']);
        }

        if (!dayOfDate({date}).day) {
          return cbk([400, 'ExpectedValidDateToGetChainPrice']);
        }

        if (!estimates) {
          return cbk([400, 'ExpectedKnownEstimatesToGetChainPrice']);
        }

        if (!fs) {
          return cbk([400, 'ExpectedFileSystemMethodsToGetChainPrice']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetChainPrice']);
        }

        if (!path) {
          return cbk([400, 'ExpectedPricesFilePathToGetChainPrice']);
        }

        return cbk();
      },

      // A price shipped with the method answers for its day
      shipped: ['validate', ({}, cbk) => {
        const shipped = known[dayOfDate({date}).day];

        return cbk(null, !shipped ? undefined : {cents: shipped.cents});
      }],

      // Get the previously derived prices
      getPrices: ['shipped', ({shipped}, cbk) => {
        // Exit early when the price was shipped or the prices are loaded
        if (!!shipped || !!estimates.rates) {
          return cbk();
        }

        return getPricesFile({fs, path}, cbk);
      }],

      // Keep the previously derived prices of the current method
      loadPrices: ['getPrices', ({getPrices}, cbk) => {
        // Exit early when there are no prices to load
        if (!getPrices) {
          return cbk();
        }

        // Prices derived by another version of the method are not used
        const current = currentEstimates({
          priors: getPrices.priors,
          provisional: getPrices.provisional,
          rates: getPrices.rates,
        });

        estimates.priors = current.priors;
        estimates.provisional = current.provisional;
        estimates.rates = current.rates;

        return cbk();
      }],

      // Get the current chain height
      getHeight: ['shipped', ({shipped}, cbk) => {
        // Exit early when the price was shipped with the method
        if (!!shipped) {
          return cbk();
        }

        return getHeight({lnd}, cbk);
      }],

      // Derive the price for the date
      getPrice: [
        'getHeight',
        'loadPrices',
        'shipped',
        ({getHeight, shipped}, cbk) =>
      {
        // Exit early when the price was shipped with the method
        if (!!shipped) {
          return cbk(null, shipped);
        }

        // Shipped prices guide the days after them but are never stored
        return getPriceForDate({
          date,
          lnd,
          logger,
          unsupported,
          get_prices: ({}, cbk) => cbk(null, {
            priors: estimates.priors,
            provisional: estimates.provisional,
            rates: assign({}, known, estimates.rates),
          }),
          height: getHeight.current_block_height,
          put_price: (estimate, cbk) => {
            return storeEstimate({estimate, estimates, fs, logger, path}, cbk);
          },
          remove_prices: ({removed}, cbk) => {
            return forgetEstimates({estimates, fs, path, removed}, cbk);
          },
        },
        cbk);
      }],
    },
    returnResult({reject, resolve, of: 'getPrice'}, cbk));
  });
};
