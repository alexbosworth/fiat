const {half} = require('./../constants');
const {sortBy} = require('./../../arrays');
const template = require('./template');

const {exp} = Math;
const flatten = arr => [].concat(...arr);
const {log10} = Math;
const {pow} = Math;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);

/** Get the round USD amounts people pay and the prior weight of each

  {}

  @returns
  {
    amounts: [<Round USD Amount Number>]
    weights: [<Prior Weight Number>]
  }
*/
module.exports = ({}) => {
  const {decades, envelope, mantissas} = template;

  // Each weight is how common the digits are, times an envelope over decades
  const center = log10(envelope.center_usd);
  const width = envelope.width_decades;

  const amounts = flatten(range(decades.min, decades.max + 1).map(decade => {
    return mantissas.map(mantissa => ({
      usd: mantissa.value * pow(10, decade),
      weight: mantissa.weight,
    }));
  }));

  const rounds = sortBy({
    array: amounts.filter(amount => amount.usd <= template.max_usd),
    attribute: 'usd',
  })
  .sorted;

  return {
    amounts: rounds.map(amount => amount.usd),
    weights: rounds.map(amount => {
      const distance = (log10(amount.usd) - center) / width;

      return amount.weight * exp(-half * distance * distance);
    }),
  };
};
