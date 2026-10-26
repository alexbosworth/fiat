const referenceDay = require('./reference_day');

const hours = [...Array(24).keys()];
const isCandles = url => url.includes('/candles?');
const secondsPerHour = 60 * 60;

/** Make a request function for reference providers that trade all day at the
  price of the day of a simulated chain

  {
    chain: <Chain Fixture Object>
    [no_candles]: [<Day Without Coinbase Candles YYYY-MM-DD String>]
    timers: <Mock Timers to Run After Each Answer Object>
  }

  @returns
  <Request Function> (args, cbk) => {}
*/
module.exports = ({chain, no_candles, timers}) => (args, cbk) => {
  const {day} = referenceDay({url: args.url});

  const usd = chain.prices[day] || chain.prices[chain.day_name(4)];

  const body = (() => {
    // Coinbase Exchange has no candles for some days
    if (isCandles(args.url) && (no_candles || []).includes(day)) {
      return {message: 'NotFound'};
    }

    // Coinbase Exchange answers with an hourly candle for every hour
    if (isCandles(args.url)) {
      const start = Date.parse(`${day}T00:00:00.000Z`) / 1000;

      // Candles come newest first
      return hours.slice().reverse().map(hour => {
        return [start + hour * secondsPerHour, usd, usd, usd, usd, 1];
      });
    }

    return {market_data: {current_price: {usd}}};
  })();

  cbk(null, null, body);

  // A pause after the answer passes at once
  return timers.runAll();
};
