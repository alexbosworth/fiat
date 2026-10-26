const {dayLength} = require('./../dates/constants');
const {msPerDay} = require('./constants');

const dayStart = day => Date.parse(`${day}T00:00:00.000Z`);

/** Add days to a day

  {
    day: <Day YYYY-MM-DD String>
    days: <Days to Add Number>
  }

  @returns
  {
    day: <Day YYYY-MM-DD String>
  }
*/
module.exports = ({day, days}) => {
  const date = new Date(dayStart(day) + days * msPerDay);

  return {day: date.toISOString().substring(Number(), dayLength)};
};
