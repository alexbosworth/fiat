const candlesDay = /start=(\d{4}-\d{2}-\d{2})/;
const coingeckoDay = /date=(\d{2}-\d{2}-\d{4})/;

/** Get the day that a reference price provider is asked about

  {
    url: <Request URL String>
  }

  @returns
  {
    day: <Day YYYY-MM-DD String>
  }
*/
module.exports = ({url}) => {
  // Exit early when Coinbase Exchange is asked for the candles of a day
  if (candlesDay.test(url)) {
    return {day: url.match(candlesDay)[1]};
  }

  return {day: url.match(coingeckoDay)[1].split('-').reverse().join('-')};
};
