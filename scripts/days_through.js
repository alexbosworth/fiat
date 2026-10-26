const addDays = require('./../chain/add_days');
const {msPerSecond} = require('./../chain/constants');

const dayStartSeconds = day => Date.parse(`${day}T00:00:00Z`) / msPerSecond;
const {max} = Math;
const secondsPerDay = 60 * 60 * 24;

/** Get the days from a first day through a last day

  {
    first: <First Day YYYY-MM-DD String>
    last: <Last Day YYYY-MM-DD String>
  }

  @returns
  {
    days: [<Day YYYY-MM-DD String>]
  }
*/
module.exports = ({first, last}) => {
  const firstStart = dayStartSeconds(first);

  const span = (dayStartSeconds(last) - firstStart) / secondsPerDay;

  const days = [...Array(max(Number(), span + 1)).keys()].map(days => {
    return addDays({days, day: first}).day;
  });

  return {days};
};
