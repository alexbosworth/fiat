const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {returnResult} = require('asyncjs-util');

const {isCalendarDay} = require('./../../dates');
const {name} = require('./../../package');
const {version} = require('./../../package');

const api = 'https://api.coingecko.com/api/v3/coins/bitcoin/history';
const asCoingeckoDate = day => day.split('-').reverse().join('-');
const centsPerDollar = 100;
const interval = n => (1 + Math.random()) * 2500 * Math.pow(2, n);
const isRateLimited = err => err[1] === 'CoingeckoRateLimitedHistoricPrice';
const rateLimitedCode = 429;
const remoteServiceTimeoutMs = 1000 * 30;
const {round} = Math;
const times = 5;
const userAgent = `${name}/${version} (+https://github.com/alexbosworth/fiat)`;

/** Get the USD price of BTC at the start of a day from CoinGecko

  {
    date: <Day YYYY-MM-DD String>
    request: <Request Function> {headers, url}, (err, r, body) => {}
  }

  @returns via cbk or Promise
  {
    cents: <USD Cents Per BTC Number>
  }
*/
module.exports = ({date, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isCalendarDay({day: date}).is_calendar_day) {
          return cbk([400, 'ExpectedYyyyMmDdDateToGetCoingeckoHistoricPrice']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestFunctionToGetHistoricPrice']);
        }

        return cbk();
      },

      // Fetch the price, retrying when rate limited
      getPrice: ['validate', ({}, cbk) => {
        const query = `date=${asCoingeckoDate(date)}&localization=false`;

        const retry = {interval, times, errorFilter: isRateLimited};

        return asyncRetry(retry, cbk => {
          // The public API wants a descriptive user agent
          return request({
            headers: {'user-agent': userAgent},
            json: true,
            timeout: remoteServiceTimeoutMs,
            url: `${api}?${query}`,
          },
          (err, r, json) => {
            if (!!err) {
              return cbk([503, 'UnexpectedErrorGettingCoingeckoPrice', {err}]);
            }

            // A refusal explains itself at the top or under an error key
            const refusal = !!json && !!json.error ? json.error : {};

            const reason = (!!json && json.status) || refusal.status || {};

            const isLimited = !!r && r.statusCode === rateLimitedCode;

            // Exit early to retry when the request was rate limited
            if (isLimited || reason.error_code === rateLimitedCode) {
              return cbk([503, 'CoingeckoRateLimitedHistoricPrice']);
            }

            // CoinGecko explains its own refusals, such as for far back days
            if (!!reason.error_message || (!!json && !!json.error)) {
              return cbk([503, 'CoingeckoRefusedHistoricPriceRequest', {
                err: reason.error_message || json.error,
              }]);
            }

            const marketData = (json || {}).market_data;

            if (!marketData || !marketData.current_price) {
              return cbk([503, 'ExpectedMarketDataInCoingeckoResponse']);
            }

            const {usd} = marketData.current_price;

            if (!usd) {
              return cbk([503, 'ExpectedUsdPriceInCoingeckoResponse']);
            }

            // The price is the one CoinGecko has for the start of the day
            return cbk(null, {cents: round(usd * centsPerDollar)});
          });
        },
        cbk);
      }],
    },
    returnResult({reject, resolve, of: 'getPrice'}, cbk));
  });
};
