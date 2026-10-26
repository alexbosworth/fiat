const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {fileVersion} = require('./constants');
const {isCalendarDay} = require('./../dates');

const isObject = n => !!n && typeof n === 'object' && !Array.isArray(n);
const {keys} = Object;
const missingFileCode = 'ENOENT';
const {parse} = JSON;

/** Get the prices stored in a prices file

  {
    fs: {
      getFile: <Read File Contents Function> (path, cbk) => {}
    }
    path: <Prices File Path String>
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
module.exports = ({fs, path}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!fs || typeof fs.getFile !== 'function') {
          return cbk([400, 'ExpectedFileSystemMethodsToGetPricesFile']);
        }

        if (!path) {
          return cbk([400, 'ExpectedPathToGetPricesFile']);
        }

        return cbk();
      },

      // Read the file
      getFile: ['validate', ({}, cbk) => {
        return fs.getFile(path, (err, res) => {
          // Exit early when there is no file yet
          if (!!err && err.code === missingFileCode) {
            return cbk();
          }

          // An unreadable file is an error so that it is never written over
          if (!!err) {
            return cbk([503, 'FailedToReadPricesFile', {err}]);
          }

          // Exit early when there is nothing in the file
          if (!res || !res.length) {
            return cbk();
          }

          return cbk(null, res);
        });
      }],

      // Parse the file contents
      parseFile: ['getFile', ({getFile}, cbk) => {
        // Exit early when there is no file yet
        if (!getFile) {
          return cbk(null, {});
        }

        const parsed = (() => {
          try {
            return {contents: parse(getFile.toString())};
          } catch (err) {
            return {err};
          }
        })();

        // Exit early when the file is not JSON
        if (!!parsed.err) {
          return cbk([503, 'FailedToParsePricesFile', {err: parsed.err}]);
        }

        return cbk(null, parsed.contents);
      }],

      // Check the contents and pull out the prices
      prices: ['getFile', 'parseFile', ({getFile, parseFile}, cbk) => {
        // Exit early when there is no file yet
        if (!getFile) {
          return cbk(null, {priors: {}, provisional: {}, rates: {}});
        }

        if (!isObject(parseFile)) {
          return cbk([503, 'ExpectedPricesObjectInPricesFile']);
        }

        const {version} = parseFile;

        // The file format has a version of its own, apart from the method's
        if (version !== undefined && version !== fileVersion) {
          return cbk([503, 'UnsupportedPricesFileVersion']);
        }

        // Only the entries that are prices for days of the calendar are read
        const read = section => {
          const entries = isObject(section) ? section : {};

          return keys(entries).reduce((sum, day) => {
            const isDay = isCalendarDay({day}).is_calendar_day;

            if (isDay && isObject(entries[day])) {
              sum[day] = entries[day];
            }

            return sum;
          },
          {});
        };

        return cbk(null, {
          priors: read(parseFile.priors),
          provisional: read(parseFile.provisional),
          rates: read(parseFile.rates),
        });
      }],
    },
    returnResult({reject, resolve, of: 'prices'}, cbk));
  });
};
