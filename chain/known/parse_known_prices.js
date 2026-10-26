const {isCalendarDay} = require('./../../dates');

const isCents = n => Number.isSafeInteger(n) && n > 0;
const isDay = day => isCalendarDay({day}).is_calendar_day;
const isObject = n => !!n && typeof n === 'object' && !Array.isArray(n);
const {keys} = Object;
const {parse} = JSON;

/** Parse the JSON of the prices shipped with the method

  {
    text: <Known Prices JSON String>
  }

  @throws
  <Error>

  @returns
  {
    rates: {
      <Day YYYY-MM-DD String>: {
        cents: <USD Cents Per BTC Number>
        version: <Method Version String>
      }
    }
    version: <Method Version String>
  }
*/
module.exports = ({text}) => {
  if (typeof text !== 'string') {
    throw new Error('ExpectedTextToParseKnownPrices');
  }

  const known = (() => {
    try {
      return parse(text);
    } catch (err) {
      return undefined;
    }
  })();

  if (!isObject(known)) {
    throw new Error('ExpectedJsonObjectToParseKnownPrices');
  }

  const {prices, version} = known;

  if (!version || typeof version !== 'string') {
    throw new Error('ExpectedMethodVersionToParseKnownPrices');
  }

  if (!isObject(prices) || !keys(prices).every(isDay)) {
    throw new Error('ExpectedPricesByDayToParseKnownPrices');
  }

  const days = keys(prices).sort();

  if (!days.every(day => isCents(prices[day]))) {
    throw new Error('ExpectedPriceInCentsToParseKnownPrices');
  }

  const rates = {};

  days.forEach(day => rates[day] = {version, cents: prices[day]});

  return {rates, version};
};
