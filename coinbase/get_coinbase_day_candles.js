const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {returnResult} = require('asyncjs-util');

const {isCalendarDay} = require('./../dates');
const {msPerSecond} = require('./constants');
const {name} = require('./../package');
const {secondsPerDay} = require('./constants');
const {sortBy} = require('./../arrays');
const {supportedFiats} = require('./constants');
const {version} = require('./../package');

const api = 'https://api.exchange.coinbase.com/products/';
const candleFields = 6;
const dayStartSeconds = day => Date.parse(`${day}T00:00:00Z`) / msPerSecond;
const defaultFiat = 'USD';
const granularitySeconds = 60 * 60;
const interval = n => (1 + Math.random()) * 1000 * Math.pow(2, n);
const {isArray} = Array;
const isNumber = n => typeof n === 'number' && !isNaN(n);
const isRateLimited = err => err[1] === 'CoinbaseRateLimitedCandlesRequest';
const lastSecond = day => `${day}T23:59:59.000Z`;
const rateLimitedCode = 429;
const remoteServiceTimeoutMs = 1000 * 30;
const times = 5;
const userAgent = `${name}/${version} (+https://github.com/alexbosworth/fiat)`;

/** Get the hourly BTC candles of a UTC day from Coinbase Exchange

  {
    date: <Day YYYY-MM-DD String>
    [fiat]: <Fiat Currency Code String> // default USD
    request: <Request Function> {headers, url}, (err, r, body) => {}
  }

  @returns via cbk or Promise
  {
    candles: [{
      close: <Last Trade Fiat Price Number>
      high: <Highest Trade Fiat Price Number>
      low: <Lowest Trade Fiat Price Number>
      open: <First Trade Fiat Price Number>
      time: <Candle Start Epoch Seconds Number>
      volume: <BTC Traded Number>
    }]
  }
*/
module.exports = ({date, fiat, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isCalendarDay({day: date}).is_calendar_day) {
          return cbk([400, 'ExpectedYyyyMmDdDateToGetCoinbaseDayCandles']);
        }

        if (!!fiat && !supportedFiats.includes(fiat)) {
          return cbk([400, 'UnsupportedFiatToGetCoinbaseDayCandles']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestFunctionToGetCoinbaseDayCandles']);
        }

        return cbk();
      },

      // Fetch the candles, retrying when rate limited
      getCandles: ['validate', ({}, cbk) => {
        const product = `BTC-${fiat || defaultFiat}`;

        const query = [
          `granularity=${granularitySeconds}`,
          `start=${date}T00:00:00.000Z`,
          `end=${lastSecond(date)}`,
        ];

        const retry = {interval, times, errorFilter: isRateLimited};

        return asyncRetry(retry, cbk => {
          return request({
            headers: {'user-agent': userAgent},
            json: true,
            timeout: remoteServiceTimeoutMs,
            url: `${api}${product}/candles?${query.join('&')}`,
          },
          (err, r, json) => {
            if (!!err) {
              return cbk([503, 'UnexpectedErrorGettingCoinbaseCandles', {
                err,
              }]);
            }

            // Exit early to retry when the request was rate limited
            if (!!r && r.statusCode === rateLimitedCode) {
              return cbk([503, 'CoinbaseRateLimitedCandlesRequest']);
            }

            // Coinbase Exchange explains its own refusals with a message
            if (!!json && !isArray(json) && !!json.message) {
              return cbk([503, 'CoinbaseRefusedCandlesRequest', {
                err: json.message,
              }]);
            }

            return cbk(null, json);
          });
        },
        cbk);
      }],

      // Pull out the candles of the day
      candles: ['getCandles', ({getCandles}, cbk) => {
        if (!isArray(getCandles)) {
          return cbk([503, 'ExpectedArrayOfCandlesInCoinbaseResponse']);
        }

        const isCandle = candle => {
          const isComplete = isArray(candle) && candle.length >= candleFields;

          return isComplete && candle.every(isNumber);
        };

        if (!getCandles.every(isCandle)) {
          return cbk([503, 'ExpectedCandleValuesInCoinbaseResponse']);
        }

        const start = dayStartSeconds(date);

        // Only candles that start within the day belong to it
        const dayCandles = getCandles
          .filter(([time]) => time >= start && time < start + secondsPerDay)
          .map(([time, low, high, opening, closing, volume]) => ({
            high,
            low,
            time,
            volume,
            close: closing,
            open: opening,
          }));

        // An hour without trades has no candle
        const candles = sortBy({array: dayCandles, attribute: 'time'}).sorted;

        // Exit early when there were no trades, as before a market opened
        if (!candles.length) {
          return cbk([503, 'ExpectedCandlesForDayInCoinbaseResponse']);
        }

        return cbk(null, {candles});
      }],
    },
    returnResult({reject, resolve, of: 'candles'}, cbk));
  });
};
