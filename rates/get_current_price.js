const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getCoinbaseCurrentPrice} = require('./../coinbase');
const {getCoindeskCurrentPrice} = require('./../coindesk');

/** Get the current fiat price from a specified rate provider

  {
    currency: <Currency String>
    fiat: <Fiat String>
    from: <From Rate Provider String>
    request: <Request Function>
  }

  @returns via cbk or Promise
  {
    cents: <Cents Per Token Number>
    date: <Updated At ISO 8601 Date String>
  }
*/
module.exports = ({currency, fiat, from, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!currency) {
          return cbk([400, 'ExpectedCurrencyToGetCurrentPriceFor']);
        }

        if (!fiat) {
          return cbk([400, 'ExpectedFiatSymbolToGetCurrentPriceIn']);
        }

        if (!from) {
          return cbk([400, 'ExpectedRateProviderToGetCurrentPrice']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestFunctionToGetCurrentPrice']);
        }

        return cbk();
      },

      // Get the current price
      getPrice: ['validate', ({}, cbk) => {
        const providers = {
          coinbase: getCoinbaseCurrentPrice,
          coindesk: getCoindeskCurrentPrice,
        };

        if (!providers[from]) {
          return cbk([400, 'UnknownRateProviderToGetCurrentFiatPrice']);
        }

        return providers[from]({currency, fiat, request}, cbk);
      }],
    },
    returnResult({reject, resolve, of: 'getPrice'}, cbk));
  });
};
