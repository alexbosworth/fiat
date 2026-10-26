const {isCalendarDay} = require('./../../dates');
const {methodVersion} = require('./../known');

const isObject = n => !!n && typeof n === 'object' && !Array.isArray(n);
const isPrice = n => Number.isInteger(n) && n >= 1e4 && n <= 1e9;
const isHeight = n => Number.isInteger(n) && n >= 0;
const {keys} = Object;

/** Keep only the known estimates that were derived by the current method

  {
    [priors]: {<Day YYYY-MM-DD String>: {[version]: <Method Version String>}}
    [provisional]: {
      <Day YYYY-MM-DD String>: {[version]: <Method Version String>}
    }
    [rates]: {<Day YYYY-MM-DD String>: {[version]: <Method Version String>}}
  }

  @returns
  {
    priors: {<Day YYYY-MM-DD String>: <Estimate Object>}
    provisional: {<Day YYYY-MM-DD String>: <Estimate Object>}
    rates: {<Day YYYY-MM-DD String>: <Estimate Object>}
  }
*/
module.exports = ({priors, provisional, rates}) => {
  // The version covers both the derivation method and the round USD template
  const {version} = methodVersion({});

  const current = ({estimates, is_provisional}) => {
    return keys(estimates || {}).reduce((sum, day) => {
      const estimate = estimates[day];

      // Exit early when the entry is not an estimate for a day of the calendar
      if (!isCalendarDay({day}).is_calendar_day || !isObject(estimate)) {
        return sum;
      }

      const {blocks} = estimate;

      const [first, last] = Array.isArray(blocks) ? blocks : [];

      // A block range is two heights in order
      const isRange = isHeight(first) && isHeight(last) && first <= last;

      // Exit early when the range is damaged or a provisional price has none
      if ((blocks !== undefined || !!is_provisional) && !isRange) {
        return sum;
      }

      // Estimates left out here will be derived again
      if (estimate.version === version && isPrice(estimate.cents)) {
        sum[day] = estimate;
      }

      return sum;
    },
    {});
  };

  return {
    priors: current({estimates: priors}),
    provisional: current({estimates: provisional, is_provisional: true}),
    rates: current({estimates: rates}),
  };
};
