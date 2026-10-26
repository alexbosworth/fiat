const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const currentEstimates = require('./current_estimates');
const {putPricesFile} = require('./../../storage');

const {isArray} = Array;
const types = ['priors', 'provisional', 'rates'];

/** Forget estimates whose last blocks are no longer in the chain

  {
    estimates: {
      priors: {<Day YYYY-MM-DD String>: <Estimate Object>}
      [provisional]: {<Day YYYY-MM-DD String>: <Estimate Object>}
      rates: {<Day YYYY-MM-DD String>: <Estimate Object>}
    }
    fs: {
      getFile: <Read File Contents Function> (path, cbk) => {}
      makeDirectory: <Make Directory Function> (path, cbk) => {}
      renameFile: <Rename File Function> (from, to, cbk) => {}
      writeFile: <Write File Contents Function> (path, contents, cbk) => {}
    }
    path: <Prices File Path String>
    removed: [{
      day: <Day YYYY-MM-DD String>
      hash: <Last Block Hash Hex String>
    }]
  }

  @returns via cbk or Promise
*/
module.exports = ({estimates, fs, path, removed}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!estimates || !estimates.priors || !estimates.rates) {
          return cbk([400, 'ExpectedKnownEstimatesToForgetEstimates']);
        }

        if (!fs) {
          return cbk([400, 'ExpectedFileSystemMethodsToForgetEstimates']);
        }

        if (!path) {
          return cbk([400, 'ExpectedPricesFilePathToForgetEstimates']);
        }

        if (!isArray(removed)) {
          return cbk([400, 'ExpectedRemovedEstimatesToForgetEstimates']);
        }

        return cbk();
      },

      // Forget the estimates that are kept in memory
      forget: ['validate', ({}, cbk) => {
        removed.forEach(({day, hash}) => {
          types.filter(type => !!estimates[type]).forEach(type => {
            const known = estimates[type][day];

            if (!!known && known.hash === hash) {
              delete estimates[type][day];
            }
          });
        });

        return cbk();
      }],

      // Remove the estimates from the prices file
      write: ['forget', ({}, cbk) => {
        // Exit early when there is nothing to remove
        if (!removed.length) {
          return cbk();
        }

        return putPricesFile({
          fs,
          path,
          removed,
          priors: estimates.priors,
          provisional: estimates.provisional,
          rates: estimates.rates,
        },
        cbk);
      }],

      // Keep the current prices that are now in the file
      update: ['write', ({write}, cbk) => {
        // Exit early when the file was not written
        if (!write) {
          return cbk();
        }

        // Prices in the file from other versions of the method are not used
        const current = currentEstimates({
          priors: write.priors,
          provisional: write.provisional,
          rates: write.rates,
        });

        estimates.priors = current.priors;
        estimates.provisional = current.provisional;
        estimates.rates = current.rates;

        return cbk();
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
