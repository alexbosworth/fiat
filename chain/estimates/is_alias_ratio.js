const {roundAmounts} = require('./../outputs');

const {abs} = Math;
const flatten = arr => [].concat(...arr);
const {log10} = Math;
const {max} = Math;
const {min} = Math;
const minAliasRatio = 2;
const tolerance = Math.log10(1.06);

/** Determine if the ratio between two prices is an alias ratio of the pattern

  {
    cents: <USD Cents Per BTC Number>
    other: <Other USD Cents Per BTC Number>
  }

  @returns
  {
    is_alias: <Prices Are At An Alias Ratio Bool>
  }
*/
module.exports = ({cents, other}) => {
  const {amounts} = roundAmounts({});

  // Ratios of two or more between round amounts are the pattern's aliases
  const ratios = flatten(amounts.map(amount => {
    const larger = amounts.filter(n => n >= amount * minAliasRatio);

    return larger.map(n => n / amount);
  }));

  const distance = log10(max(cents, other) / min(cents, other));

  const isNear = ratio => abs(log10(ratio) - distance) < tolerance;

  return {is_alias: ratios.some(isNear)};
};
