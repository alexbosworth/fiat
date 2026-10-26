const {msPerDay} = require('./../constants');
const {sortBy} = require('./../../arrays');

const {abs} = Math;
const dayStart = day => Date.parse(`${day}T00:00:00.000Z`);
const flatten = arr => [].concat(...arr);
const {keys} = Object;

/** Find the known price estimate that is closest in time to a day

  {
    day: <Day YYYY-MM-DD String>
    estimates: {
      [priors]: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
      [provisional]: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
      [rates]: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
    }
    [latest]: <Latest Day To Consider YYYY-MM-DD String>
  }

  @returns
  {
    [estimate]: {
      cents: <USD Cents Per BTC Number>
      day: <Day YYYY-MM-DD String>
      distance: <Days Away Number>
    }
  }
*/
module.exports = ({day, estimates, latest}) => {
  const sources = [estimates.rates, estimates.priors, estimates.provisional];

  const isConsidered = known => !latest || known <= latest;

  const known = flatten(sources.filter(n => !!n).map(source => {
    return keys(source).filter(isConsidered).map(known => ({
      cents: source[known].cents,
      day: known,
      distance: abs(dayStart(day) - dayStart(known)) / msPerDay,
    }));
  }));

  // The nearest estimate, the earliest of them when two are as near
  const byDay = sortBy({array: known, attribute: 'day'}).sorted;

  const [estimate] = sortBy({array: byDay, attribute: 'distance'}).sorted;

  return {estimate};
};
