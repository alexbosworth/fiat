const asyncAuto = require('async/auto');
const asyncMap = require('async/map');
const {returnResult} = require('asyncjs-util');

const addDays = require('./../../chain/add_days');
const {centsPerDollar} = require('./../../chain/constants');
const {getCoinbaseDayCandles} = require('./../../coinbase');
const getCoingeckoHistoricPrice = require('./get_coingecko_historic_price');
const {isCalendarDay} = require('./../../dates');
const medianOf = require('./../median_of');
const {msPerDay} = require('./../../chain/constants');

const coinbase = 'coinbase';
const coingecko = 'coingecko';
const coingeckoHistoryDays = 364;
const dayStart = day => Date.parse(`${day}T00:00:00.000Z`);
const nextDay = 1;
const {round} = Math;
const {sqrt} = Math;
const sum = arr => arr.reduce((total, n) => total + n, Number());
const typicalPrice = n => (n.high + n.low + n.close) / 3;

/** Get a reference USD price for a day from a rate provider

  {
    date: <Day YYYY-MM-DD String>
    request: <Request Function> {headers, url}, (err, r, body) => {}
  }

  @returns via cbk or Promise
  {
    cents: <Reference USD Cents Per BTC Number>
    close_cents: <Last Trade or Next Day Start USD Cents Number>
    [coinbase_error]: <Candles Failure That Led to Using CoinGecko Array>
    [hours]: <Hours of the Day With Trades Count Number>
    open_cents: <First Trade or Day Start USD Cents Number>
    source: <Rate Provider Name String>
    [vwap_cents]: <Volume Weighted Average USD Cents Per BTC Number>
  }
*/
module.exports = ({date, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isCalendarDay({day: date}).is_calendar_day) {
          return cbk([400, 'ExpectedYyyyMmDdDateToGetReferencePrice']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestFunctionToGetReferencePrice']);
        }

        return cbk();
      },

      // Get the day's candles, keeping a failure to ask CoinGecko after
      fromCandles: ['validate', ({}, cbk) => {
        return getCoinbaseDayCandles({date, request}, (err, res) => {
          if (!!err) {
            return cbk(null, {err});
          }

          const {candles} = res;

          const volume = sum(candles.map(n => n.volume));

          const weighted = sum(candles.map(n => typicalPrice(n) * n.volume));

          const vwapCents = round(weighted / volume * centsPerDollar);

          const [first] = candles;
          const last = candles[candles.length - 1];

          const {median} = medianOf({numbers: candles.map(typicalPrice)});

          return cbk(null, {
            cents: round(median * centsPerDollar),
            close_cents: round(last.close * centsPerDollar),
            hours: candles.length,
            open_cents: round(first.open * centsPerDollar),
            source: coinbase,
            vwap_cents: !volume ? undefined : vwapCents,
          });
        });
      }],

      // Ask CoinGecko for the day and next day start prices when needed
      fromCoingecko: ['fromCandles', ({fromCandles}, cbk) => {
        // Exit early when the candles gave the reference
        if (!fromCandles.err) {
          return cbk(null, fromCandles);
        }

        const age = (Date.now() - dayStart(date)) / msPerDay;

        // Exit early when the day is older than CoinGecko will serve
        if (age > coingeckoHistoryDays) {
          return cbk(fromCandles.err);
        }

        const days = [date, addDays({day: date, days: nextDay}).day];

        return asyncMap(days, (day, cbk) => {
          return getCoingeckoHistoricPrice({date: day, request}, cbk);
        },
        (err, res) => {
          if (!!err) {
            return cbk([503, 'FailedToGetReferencePriceFromProviders', {
              coinbase: fromCandles.err,
              coingecko: err,
            }]);
          }

          const [start, next] = res.map(n => n.cents);

          return cbk(null, {
            cents: round(sqrt(start * next)),
            close_cents: next,
            coinbase_error: fromCandles.err,
            open_cents: start,
            source: coingecko,
          });
        });
      }],
    },
    returnResult({reject, resolve, of: 'fromCoingecko'}, cbk));
  });
};
