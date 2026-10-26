const {isRoundTokens} = require('./../histogram');
const {lowerBound} = require('./../histogram');

const bandShare = 0.005;
const decades = [4, 5, 6, 7, 8, 9, 10, 11];
const flatten = arr => [].concat(...arr);
const {floor} = Math;
const mantissas = [1, 2, 5];
const minExcessDeviations = 4;
const {pow} = Math;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);
const {round} = Math;
const {sqrt} = Math;
const surroundShare = 0.03;

/** Cap the values that cluster just off round amounts of BTC

  {
    outputs: [<Output Tokens Number>]
  }

  @returns
  {
    outputs: [<Output Tokens Number>]
  }
*/
module.exports = ({outputs}) => {
  const isRound = tokens => isRoundTokens({tokens}).is_round;

  const amounts = flatten(decades.map(decade => {
    return mantissas.map(mantissa => mantissa * pow(10, decade));
  }));

  // Exact round values are left in place, to be capped on their own
  const exact = outputs.filter(tokens => isRound(tokens));
  const sorted = Float64Array.from(outputs.filter(n => !isRound(n))).sort();

  const indexOf = value => lowerBound({sorted, value}).index;

  // The bands that clearly stand out, with how many of their values to keep
  const capped = amounts.map(amount => {
    const high = amount * (1 + bandShare);
    const low = amount * (1 - bandShare);
    const reach = amount * surroundShare;

    const end = indexOf(high);
    const start = indexOf(low);

    const around = start - indexOf(low - reach) + indexOf(high + reach) - end;

    const expected = around * (high - low) / (reach + reach);

    // Exit early when the band does not clearly stand out from around it
    if (end - start <= expected + minExcessDeviations * sqrt(expected)) {
      return undefined;
    }

    return {end, start, keep: round(expected)};
  });

  const dropped = new Set();

  // Keep evenly spaced values across each band that stands out
  capped.filter(n => !!n).forEach(({end, keep, start}) => {
    const count = end - start;

    return range(start, end).forEach((index, position) => {
      const before = floor(position * keep / count);

      const isKept = floor((position + 1) * keep / count) > before;

      if (!isKept) {
        dropped.add(index);
      }

      return;
    });
  });

  const kept = [...sorted].filter((n, i) => !dropped.has(i));

  return {outputs: exact.concat(kept)};
};
