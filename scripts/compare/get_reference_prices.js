const asyncAuto = require('async/auto');
const asyncMapSeries = require('async/mapSeries');
const {returnResult} = require('asyncjs-util');

const getReferencePrice = require('./get_reference_price');

const coinbasePauseMs = 200;
const coingecko = 'coingecko';
const coingeckoPauseMs = 1000;

/** Get the reference prices of days, pausing after each request

  {
    days: [<Day YYYY-MM-DD String>]
    [logger]: <Winston Logger Object>
    request: <Request Function>
  }

  @returns via cbk or Promise
  {
    references: {
      <Day YYYY-MM-DD String>: {
        date: <Day YYYY-MM-DD String>
        [err]: <Reference Price Error Array>
        [reference]: <Reference Price Object>
      }
    }
  }
*/
module.exports = ({days, logger, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Get the reference price of each day
      getReferences: cbk => {
        return asyncMapSeries(days, (date, cbk) => {
          return getReferencePrice({date, request}, (err, res) => {
            // A day with no reference price is reported, not fatal
            if (!!err) {
              return cbk(null, {date, err});
            }

            // Falling back to the second provider is worth knowing about
            if (!!logger && !!res.coinbase_error) {
              const [, failure, details] = res.coinbase_error;

              const reason = !!details && details.err;

              logger.info({
                reference_from_coingecko: {
                  date,
                  coinbase: failure,
                  reason: typeof reason === 'string' ? reason : undefined,
                },
              });
            }

            const isCoingecko = res.source === coingecko;

            // CoinGecko limits requests more strictly than Coinbase does
            return setTimeout(() => {
              return cbk(null, {date, reference: res});
            },
            isCoingecko ? coingeckoPauseMs : coinbasePauseMs);
          });
        },
        cbk);
      },

      // Look up the reference prices by day
      references: ['getReferences', ({getReferences}, cbk) => {
        return cbk(null, {
          references: getReferences.reduce((byDate, reference) => {
            byDate[reference.date] = reference;

            return byDate;
          },
          {}),
        });
      }],
    },
    returnResult({reject, resolve, of: 'references'}, cbk));
  });
};
