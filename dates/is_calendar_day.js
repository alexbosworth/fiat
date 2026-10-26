const dayOfDate = require('./day_of_date');

/** Determine whether a day is a day of the calendar written as YYYY-MM-DD

  {
    day: <Day YYYY-MM-DD String>
  }

  @returns
  {
    is_calendar_day: <Day Is a Day of the Calendar Bool>
  }
*/
module.exports = ({day}) => {
  return {is_calendar_day: !!day && dayOfDate({date: day}).day === day};
};
