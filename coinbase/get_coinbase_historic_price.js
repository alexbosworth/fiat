const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {dayLength} = require('./../dates/constants');
const getCoinbaseDayCandles = require('./get_coinbase_day_candles');
const {msPerSecond} = require('./constants');
const {secondsPerDay} = require('./constants');
const {sortBy} = require('./../arrays');
const {supportedFiats} = require('./constants');
const {timeOfDate} = require('./../dates');

const {abs} = Math;
const centsPerUnit = 100;
const dayStartSeconds = day => Date.parse(`${day}T00:00:00Z`) / msPerSecond;
const {floor} = Math;
const knownDays = new WeakMap();
const {round} = Math;
const secondsPerHour = 60 * 60;
const settleSeconds = 60 * 60;
const typicalPrice = n => (n.high + n.low + n.close) / 3;

/** Get the price of BTC at the hour of a date on Coinbase Exchange

  {
    date: <ISO 8601 Date String>
    fiat: <Fiat Currency Code String>
    request: <Request Function> {headers, url}, (err, r, body) => {}
  }

  @returns via cbk or Promise
  {
    cents: <Cents Per BTC Number>
    date: <Start of the Hour Priced At ISO 8601 Date String>
  }
*/
module.exports = ({date, fiat, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (timeOfDate({date}).time === undefined) {
          return cbk([400, 'ExpectedDateToGetCoinbaseHistoricPrice']);
        }

        if (!supportedFiats.includes(fiat)) {
          return cbk([400, 'UnsupportedFiatToGetCoinbaseHistoricPrice']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestToGetCoinbaseHistoricPrice']);
        }

        return cbk();
      },

      // Get the candles of the day of the date, sharing them across lookups
      getCandles: ['validate', ({}, cbk) => {
        // A time without an offset is taken to be in UTC
        const {time} = timeOfDate({date});

        const day = new Date(time).toISOString().slice(Number(), dayLength);

        // Days are kept with the request function that they were fetched with
        if (!knownDays.has(request)) {
          knownDays.set(request, new Map());
        }

        const days = knownDays.get(request);
        const key = `${fiat}:${day}`;

        const known = days.get(key);

        // Exit early when the candles of the day are already known
        if (!!known && !!known.candles) {
          return cbk(null, {candles: known.candles});
        }

        // Exit early when the candles of the day are already being fetched
        if (!!known) {
          known.waiting.push(cbk);

          return;
        }

        const waiting = [cbk];

        days.set(key, {waiting});

        const dayEnd = dayStartSeconds(day) + secondsPerDay;

        // The candles of a day are settled once it has been over for an hour
        const isSettled = dayEnd + settleSeconds <= Date.now() / msPerSecond;

        return getCoinbaseDayCandles({
          fiat,
          request,
          date: day,
        },
        (err, res) => {
          // A failed fetch or a day that is not settled is fetched again later
          if (!!err || !isSettled) {
            days.delete(key);
          } else {
            days.set(key, {candles: res.candles});
          }

          return waiting.forEach(cbk => !!err ? cbk(err) : cbk(null, res));
        });
      }],

      // The typical price of the hour of the date, or the nearest with trades
      price: ['getCandles', ({getCandles}, cbk) => {
        const seconds = timeOfDate({date}).time / msPerSecond;

        const hour = floor(seconds / secondsPerHour) * secondsPerHour;

        const distances = getCandles.candles.map(candle => {
          return {candle, distance: abs(candle.time - hour)};
        });

        const [{candle}] = sortBy({
          array: distances,
          attribute: 'distance',
        })
        .sorted;

        return cbk(null, {
          cents: round(typicalPrice(candle) * centsPerUnit),
          date: new Date(candle.time * msPerSecond).toISOString(),
        });
      }],
    },
    returnResult({reject, resolve, of: 'price'}, cbk));
  });
};
