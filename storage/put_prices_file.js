const {dirname} = require('path');

const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {fileVersion} = require('./constants');
const {fsMethods} = require('./constants');
const getPricesFile = require('./get_prices_file');
const isPrices = require('./is_prices');
const tempPath = require('./temp_path');

const asJson = obj => JSON.stringify(obj, null, 2);
const {assign} = Object;
const {keys} = Object;
const lastBlock = n => Array.isArray(n.blocks) ? n.blocks[1] : -Infinity;
const provisionalDays = 2;
const replaced = ['priors', 'provisional'];
const types = ['priors', 'provisional', 'rates'];

/** Store prices in a prices file

  {
    fs: {
      getFile: <Read File Contents Function> (path, cbk) => {}
      makeDirectory: <Make Directory Function> (path, cbk) => {}
      renameFile: <Rename File Function> (from, to, cbk) => {}
      writeFile: <Write File Contents Function> (path, contents, cbk) => {}
    }
    path: <Prices File Path String>
    priors: {
      <Day YYYY-MM-DD String>: {
        [agreement]: <Spike Strengths Agreement With Prior Weights Number>
        [blocks]: [<First Block Height Number>, <Last Block Height Number>]
        cents: <USD Cents Per BTC Number>
        [confidence]: <Best Position Score Over Best Alias Score Number>
        [hash]: <Last Block Hash Hex String>
        [outputs]: <Payment Outputs Considered Count Number>
        [payments]: <Estimated Round USD Payments Count Number>
        [rivalry]: <Best Rival Position Score Over Best Score Number>
        [round_shift]: <Price Change If Round BTC Values Were Counted Number>
        [dispersion]: <Peak Width Beyond Smoothing As Price Fraction Number>
        [stability]: <Largest Price Change From Perturbed Refinement Number>
        [version]: <Method Version String>
      }
    }
    [provisional]: {
      <Day YYYY-MM-DD String>: {
        blocks: [<First Block Height Number>, <Last Block Height Number>]
        cents: <USD Cents Per BTC Number>
        hash: <Last Block Hash Hex String>
        version: <Method Version String>
      }
    }
    rates: {
      <Day YYYY-MM-DD String>: {
        [agreement]: <Spike Strengths Agreement With Prior Weights Number>
        [blocks]: [<First Block Height Number>, <Last Block Height Number>]
        cents: <USD Cents Per BTC Number>
        [confidence]: <Best Position Score Over Best Alias Score Number>
        [hash]: <Last Block Hash Hex String>
        [outputs]: <Payment Outputs Considered Count Number>
        [payments]: <Estimated Round USD Payments Count Number>
        [rivalry]: <Best Rival Position Score Over Best Score Number>
        [round_shift]: <Price Change If Round BTC Values Were Counted Number>
        [dispersion]: <Peak Width Beyond Smoothing As Price Fraction Number>
        [stability]: <Largest Price Change From Perturbed Refinement Number>
        [version]: <Method Version String>
      }
    }
    [removed]: [{
      day: <Day YYYY-MM-DD String>
      hash: <Last Block Hash Hex String>
    }]
  }

  @returns via cbk or Promise
  {
    priors: {
      <Day YYYY-MM-DD String>: {
        [agreement]: <Spike Strengths Agreement With Prior Weights Number>
        [blocks]: [<First Block Height Number>, <Last Block Height Number>]
        cents: <USD Cents Per BTC Number>
        [confidence]: <Best Position Score Over Best Alias Score Number>
        [hash]: <Last Block Hash Hex String>
        [outputs]: <Payment Outputs Considered Count Number>
        [payments]: <Estimated Round USD Payments Count Number>
        [rivalry]: <Best Rival Position Score Over Best Score Number>
        [round_shift]: <Price Change If Round BTC Values Were Counted Number>
        [dispersion]: <Peak Width Beyond Smoothing As Price Fraction Number>
        [stability]: <Largest Price Change From Perturbed Refinement Number>
        [version]: <Method Version String>
      }
    }
    provisional: {
      <Day YYYY-MM-DD String>: {
        blocks: [<First Block Height Number>, <Last Block Height Number>]
        cents: <USD Cents Per BTC Number>
        hash: <Last Block Hash Hex String>
        version: <Method Version String>
      }
    }
    rates: {
      <Day YYYY-MM-DD String>: {
        [agreement]: <Spike Strengths Agreement With Prior Weights Number>
        [blocks]: [<First Block Height Number>, <Last Block Height Number>]
        cents: <USD Cents Per BTC Number>
        [confidence]: <Best Position Score Over Best Alias Score Number>
        [hash]: <Last Block Hash Hex String>
        [outputs]: <Payment Outputs Considered Count Number>
        [payments]: <Estimated Round USD Payments Count Number>
        [rivalry]: <Best Rival Position Score Over Best Score Number>
        [round_shift]: <Price Change If Round BTC Values Were Counted Number>
        [dispersion]: <Peak Width Beyond Smoothing As Price Fraction Number>
        [stability]: <Largest Price Change From Perturbed Refinement Number>
        [version]: <Method Version String>
      }
    }
  }
*/
module.exports = (args, cbk) => {
  const {fs, path, priors, provisional, rates, removed} = args;

  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!fs || !fsMethods.every(n => typeof fs[n] === 'function')) {
          return cbk([400, 'ExpectedFileSystemMethodsToPutPricesFile']);
        }

        if (!path) {
          return cbk([400, 'ExpectedPathToPutPricesFile']);
        }

        // Prices are keyed by days of the calendar as YYYY-MM-DD
        if (!isPrices({prices: priors}).is_prices) {
          return cbk([400, 'ExpectedPriorsToPutPricesFile']);
        }

        const isProvisional = isPrices({prices: provisional}).is_prices;

        if (provisional !== undefined && !isProvisional) {
          return cbk([400, 'ExpectedProvisionalPricesToPutPricesFile']);
        }

        if (!isPrices({prices: rates}).is_prices) {
          return cbk([400, 'ExpectedRatesToPutPricesFile']);
        }

        if (removed !== undefined && !Array.isArray(removed)) {
          return cbk([400, 'ExpectedRemovedPricesToPutPricesFile']);
        }

        return cbk();
      },

      // Make sure the directory exists, it may already be there
      makeDirectory: ['validate', ({}, cbk) => {
        return fs.makeDirectory(dirname(path), () => cbk());
      }],

      // Get the prices in the file, a file that cannot be read is not written
      getFile: ['makeDirectory', ({}, cbk) => getPricesFile({fs, path}, cbk)],

      // Merge with the prices that are already in the file
      merge: ['getFile', ({getFile}, cbk) => {
        const merged = {
          priors: assign({}, priors),
          provisional: assign({}, provisional),
          rates: assign({}, rates),
          version: fileVersion,
        };

        keys(getFile.rates).forEach(day => {
          merged.rates[day] = merged.rates[day] || getFile.rates[day];
        });

        keys(getFile.priors).forEach(day => {
          merged.priors[day] = merged.priors[day] || getFile.priors[day];
        });

        // The provisional price derived from the later blocks is kept
        keys(getFile.provisional).forEach(day => {
          const mine = merged.provisional[day];
          const theirs = getFile.provisional[day];

          if (!mine || lastBlock(theirs) > lastBlock(mine)) {
            merged.provisional[day] = theirs;
          }
        });

        // A full day rate replaces the other prices of its version
        keys(merged.rates).forEach(day => {
          const {version} = merged.rates[day];

          const isSameVersion = type => {
            const other = merged[type][day];

            return !!other && other.version === version;
          };

          replaced.filter(isSameVersion).forEach(type => {
            delete merged[type][day];
          });
        });

        const days = keys(merged.provisional).sort();

        // Only the provisional prices of the latest days are kept
        days.slice(Number(), -provisionalDays).forEach(day => {
          delete merged.provisional[day];
        });

        // A price from blocks that were replaced is removed for good
        (removed || []).forEach(({day, hash}) => {
          types.filter(type => {
            return !!merged[type][day] && merged[type][day].hash === hash;
          })
          .forEach(type => delete merged[type][day]);
        });

        return cbk(null, merged);
      }],

      // Each write has its own temporary file
      temp: ['merge', ({}, cbk) => cbk(null, tempPath({path}).path)],

      // Write to a temporary file so a partial write is never seen
      write: ['merge', 'temp', ({merge, temp}, cbk) => {
        return fs.writeFile(temp, asJson(merge), err => {
          if (!!err) {
            return cbk([503, 'FailedToWritePricesFile', {err}]);
          }

          return cbk();
        });
      }],

      // Atomically swap the temporary file in place of the prices file
      swap: ['merge', 'temp', 'write', ({merge, temp}, cbk) => {
        return fs.renameFile(temp, path, err => {
          if (!!err) {
            return cbk([503, 'FailedToReplacePricesFile', {err}]);
          }

          return cbk(null, merge);
        });
      }],
    },
    returnResult({reject, resolve, of: 'swap'}, cbk));
  });
};
