const {dayLength} = require('./constants');
const timeOfDate = require('./time_of_date');

const isoDay = time => new Date(time).toISOString().slice(Number(), dayLength);

/** Get the day in UTC of an ISO 8601 date

  {
    date: <ISO 8601 Date String>
  }

  @returns
  {
    [day]: <Day In UTC YYYY-MM-DD String>
  }
*/
module.exports = ({date}) => {
  const {time} = timeOfDate({date});

  // Exit early when the date cannot be read
  if (time === undefined) {
    return {};
  }

  return {day: isoDay(time)};
};
