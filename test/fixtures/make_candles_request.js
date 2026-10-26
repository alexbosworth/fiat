const hours = [...Array(24).keys()];
const secondsPerHour = 60 * 60;
const startDay = /start=(\d{4}-\d{2}-\d{2})/;

/** Make a request function for Coinbase Exchange that answers with hourly
  candles around the price of the day of a simulated chain, newest first

  {
    chain: <Chain Fixture Object>
    [shift]: <Trade Away From the Price by Fraction of the Price Number>
    spread: <Distance of the Low and High From the Price Fraction Number>
  }

  @returns
  <Request Function> (args, cbk) => {}
*/
module.exports = ({chain, shift, spread}) => (args, cbk) => {
  const day = args.url.match(startDay)[1];

  const start = Date.parse(`${day}T00:00:00.000Z`) / 1000;

  const usd = chain.prices[day] * (1 + (shift || Number()));

  return cbk(null, {statusCode: 200}, hours.slice().reverse().map(hour => {
    const [low, high] = [usd * (1 - spread), usd * (1 + spread)];

    return [start + hour * secondsPerHour, low, high, usd, usd, 1];
  }));
};
