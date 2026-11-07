const asyncAuto = require('async/auto');
const asyncReflect = require('async/reflect');
const {getHeight} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const currentEstimates = require('./current_estimates');
const {dayOfDate} = require('./../../dates');
const forgetEstimates = require('./forget_estimates');
const getKeptBlocks = require('./get_kept_blocks');
const getPriceForDate = require('./get_price_for_date');
const {getPricesFile} = require('./../../storage');
const keepFetchedBlock = require('./keep_fetched_block');
const storeEstimate = require('./store_estimate');

const {assign} = Object;

/** Get the USD price of BTC on a date derived from chain data

  {
    [blocks_path]: <Kept Blocks File Path String>
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
    [kept]: {
      [blocks]: <Kept Blocks By Height Map Object>
      [fetched]: <Heights Fetched Since a Save Was Asked For Set Object>
      [floor]: <Lowest Recent Block Height Number>
      [saved]: <Heights of the Blocks In the Blocks File Set Object>
      [saves]: <Saves of the Blocks File Queue Object>
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
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.date) {
          return cbk([400, 'ExpectedDateToGetChainPrice']);
        }

        if (!dayOfDate({date: args.date}).day) {
          return cbk([400, 'ExpectedValidDateToGetChainPrice']);
        }

        if (!args.estimates) {
          return cbk([400, 'ExpectedKnownEstimatesToGetChainPrice']);
        }

        if (!args.fs) {
          return cbk([400, 'ExpectedFileSystemMethodsToGetChainPrice']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetChainPrice']);
        }

        if (!args.path) {
          return cbk([400, 'ExpectedPricesFilePathToGetChainPrice']);
        }

        if (!!args.blocks_path && !args.kept) {
          return cbk([400, 'ExpectedKeptBlocksToGetChainPrice']);
        }

        return cbk();
      },

      // A price shipped with the method answers for its day
      shipped: ['validate', ({}, cbk) => {
        const {day} = dayOfDate({date: args.date});

        // Exit early when there is no price shipped for the day
        if (!args.known || !args.known[day]) {
          return cbk();
        }

        return cbk(null, {cents: args.known[day].cents});
      }],

      // Get the previously derived prices
      getPrices: ['shipped', ({shipped}, cbk) => {
        // Exit early when the price was shipped or the prices are loaded
        if (!!shipped || !!args.estimates.rates) {
          return cbk();
        }

        return getPricesFile({fs: args.fs, path: args.path}, cbk);
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

        args.estimates.priors = current.priors;
        args.estimates.provisional = current.provisional;
        args.estimates.rates = current.rates;

        return cbk();
      }],

      // Get the current chain height
      getHeight: ['shipped', ({shipped}, cbk) => {
        // Exit early when the price was shipped with the method
        if (!!shipped) {
          return cbk();
        }

        return getHeight({lnd: args.lnd}, cbk);
      }],

      // Get the kept blocks still in the chain when the day needs blocks
      getKept: ['getHeight', 'loadPrices', ({getHeight}, cbk) => {
        // Exit early when blocks are not kept
        if (!getHeight || !args.blocks_path) {
          return cbk();
        }

        // Exit early when the price of the day is already known
        if (!!args.estimates.rates[dayOfDate({date: args.date}).day]) {
          return cbk();
        }

        return getKeptBlocks({
          fs: args.fs,
          height: getHeight.current_block_height,
          kept: args.kept,
          lnd: args.lnd,
          logger: args.logger,
          path: args.blocks_path,
        },
        cbk);
      }],

      // Derive the price for the date, with a failure held as a result
      getPrice: [
        'getHeight',
        'getKept',
        'loadPrices',
        'shipped',
        asyncReflect(({getHeight, getKept, shipped}, cbk) =>
      {
        // Exit early when the price was shipped with the method
        if (!!shipped) {
          return cbk();
        }

        // Shipped prices guide the days after them but are never stored
        return getPriceForDate({
          blocks: !getKept ? undefined : getKept.blocks,
          date: args.date,
          fetched: ({height}) => keepFetchedBlock({height, kept: args.kept}),
          get_prices: ({}, cbk) => cbk(null, {
            priors: args.estimates.priors,
            provisional: args.estimates.provisional,
            rates: assign({}, args.known, args.estimates.rates),
          }),
          height: getHeight.current_block_height,
          lnd: args.lnd,
          logger: args.logger,
          put_price: (estimate, cbk) => {
            return storeEstimate({
              estimate,
              estimates: args.estimates,
              fs: args.fs,
              logger: args.logger,
              path: args.path,
            },
            cbk);
          },
          remove_prices: ({removed}, cbk) => {
            return forgetEstimates({
              removed,
              estimates: args.estimates,
              fs: args.fs,
              path: args.path,
            },
            cbk);
          },
          unsupported: args.unsupported,
        },
        cbk);
      })],

      // Save the blocks that were fetched, even when there is no price
      saveKept: ['getPrice', ({}, cbk) => {
        // Exit early when blocks are not kept
        if (!args.kept || !args.kept.saves) {
          return cbk();
        }

        return args.kept.saves.push({}, cbk);
      }],

      // The price for the date
      price: [
        'getPrice',
        'saveKept',
        'shipped',
        ({getPrice, shipped}, cbk) =>
      {
        // Exit early when the price was shipped with the method
        if (!!shipped) {
          return cbk(null, shipped);
        }

        // Exit early when the price could not be derived
        if (!!getPrice.error) {
          return cbk(getPrice.error);
        }

        return cbk(null, getPrice.value);
      }],
    },
    returnResult({reject, resolve, of: 'price'}, cbk));
  });
};
