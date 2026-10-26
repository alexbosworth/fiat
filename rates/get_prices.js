const asyncAuto = require('async/auto');
const asyncMap = require('async/map');
const {returnResult} = require('asyncjs-util');

const {getCoinbaseHistoricPrice} = require('./../coinbase');
const {getCoingeckoRates} = require('./../coingecko');
const getCurrentPrice = require('./get_current_price');
const {timeOfDate} = require('./../dates');

const currency = 'BTC';
const defaultFiat = 'USD';
const historicProvider = 'coinbase';
const {isArray} = Array;
const uniq = arr => Array.from(new Set(arr));

/** Get exchange rates from a rate provider

  {
    [date]: <Rates At the Hour of ISO 8601 Date String>
    from: <From Rate Provider String>
    request: <Request Function> {url}, (err, {statusCode}, body) => {}
    symbols: [<Fiat Symbol String>] // empty defaults to USD
  }

  @returns via cbk or Promise
  {
    tickers: [{
      date: <Rate Updated At or Hour Priced At ISO 8601 Date String>
      rate: <Exchange Rate in Cents Number>
      ticker: <Ticker Symbol String>
    }]
  }
*/
module.exports = ({date, from, request, symbols}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!from) {
          return cbk([400, 'ExpectedFromRateProviderToGetPriceRates']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestFunctionToGetExchangeRates']);
        }

        if (!isArray(symbols)) {
          return cbk([400, 'ExpectedSymbolsToGetFiatExchangeRates']);
        }

        if (date !== undefined && timeOfDate({date}).time === undefined) {
          return cbk([400, 'ExpectedValidDateToGetExchangeRatesAtDate']);
        }

        // Coinbase has hourly prices back to 2015, for USD, EUR and GBP
        if (date !== undefined && from !== historicProvider) {
          return cbk([400, 'ExpectedCoinbaseRateProviderForRatesAtDate']);
        }

        return cbk();
      },

      // Symbols to get
      priceSymbols: ['validate', ({}, cbk) => {
        const prices = [];

        symbols.forEach(n => prices.push(n));

        if (!symbols.length) {
          prices.push(defaultFiat);
        }

        return cbk(null, uniq(prices));
      }],

      // Get the prices at the hour of the date
      getHistoricPrices: ['priceSymbols', ({priceSymbols}, cbk) => {
        // Exit early when the current prices are wanted
        if (date === undefined) {
          return cbk();
        }

        return asyncMap(priceSymbols, (fiat, cbk) => {
          return getCoinbaseHistoricPrice({
            date,
            fiat,
            request,
          },
          (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            return cbk(null, {date: res.date, rate: res.cents, ticker: fiat});
          });
        },
        cbk);
      }],

      // Batch fetch prices
      getBatchPrices: ['priceSymbols', ({priceSymbols}, cbk) => {
        // Exit early when batch rate lookups are not supported
        if (date !== undefined || from !== 'coingecko') {
          return cbk();
        }

        return getCoingeckoRates({request, symbols: priceSymbols}, cbk);
      }],

      // Fetch all the prices
      getPrices: ['priceSymbols', ({priceSymbols}, cbk) => {
        // Exit early when the prices are at a date or are fetched in a batch
        if (date !== undefined || from === 'coingecko') {
          return cbk();
        }

        return asyncMap(priceSymbols, (fiat, cbk) => {
          return getCurrentPrice({
            currency,
            fiat,
            from,
            request,
          },
          (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            return cbk(null, {date: res.date, rate: res.cents, ticker: fiat});
          });
        },
        cbk);
      }],

      // Final set of prices
      prices: [
        'getBatchPrices',
        'getHistoricPrices',
        'getPrices',
        ({getBatchPrices, getHistoricPrices, getPrices}, cbk) =>
      {
        // Exit early when the prices are at a date
        if (!!getHistoricPrices) {
          return cbk(null, {tickers: getHistoricPrices});
        }

        // Exit early when price fetching was batched
        if (!!getBatchPrices) {
          return cbk(null, getBatchPrices);
        }

        return cbk(null, {tickers: getPrices});
      }],
    },
    returnResult({reject, resolve, of: 'prices'}, cbk));
  });
};
