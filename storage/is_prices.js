const {isCalendarDay} = require('./../dates');

const isDay = day => isCalendarDay({day}).is_calendar_day;
const isObject = n => !!n && typeof n === 'object' && !Array.isArray(n);
const {keys} = Object;
const {values} = Object;

/** Determine whether a value is a set of prices by day

  {
    prices: <Prices By Day Object>
  }

  @returns
  {
    is_prices: <Value Is a Set of Prices By Day Bool>
  }
*/
module.exports = ({prices}) => {
  // Exit early when the prices are not an object
  if (!isObject(prices)) {
    return {is_prices: false};
  }

  // Exit early when a price is not for a day of the calendar
  if (!keys(prices).every(isDay)) {
    return {is_prices: false};
  }

  return {is_prices: values(prices).every(isObject)};
};
