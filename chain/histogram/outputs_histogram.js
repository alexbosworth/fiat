const isRoundTokens = require('./is_round_tokens');
const lowerBound = require('./lower_bound');
const {maxTokens} = require('./../constants');
const {minTokens} = require('./../constants');
const {roundTokensMultiple} = require('./../constants');

const binsPerDecade = 200;
const {ceil} = Math;
const {floor} = Math;
const {log10} = Math;
const {max} = Math;
const {min} = Math;
const minNeighborhood = 20;
const neighborhoodShare = 0.001;
const {round} = Math;

/** Make a normalized log scale histogram of output values

  {
    [is_counting_round]: <Count Round Values In Full Bool>
    outputs: [<Output Tokens Number>]
  }

  @returns
  {
    bins: [<Share of Outputs in Bin Number>]
    bins_per_decade: <Bins Per Factor of Ten Number>
  }
*/
module.exports = args => {
  const {outputs} = args;

  const binFor = tokens => round(log10(tokens) * binsPerDecade);
  const counts = Array(round(log10(maxTokens) * binsPerDecade) + 1).fill(0);
  const rounded = new Map();

  const included = outputs.filter(n => n >= minTokens && n <= maxTokens);

  const plain = included.filter(tokens => {
    // Exit early when the value is not round or round values count in full
    if (!!args.is_counting_round || !isRoundTokens({tokens}).is_round) {
      return true;
    }

    rounded.set(tokens, (rounded.get(tokens) || Number()) + 1);

    return false;
  });

  plain.forEach(tokens => counts[binFor(tokens)]++);

  const sorted = Float64Array.from(plain).sort();

  // A round value counts for no more than its neighboring values suggest
  rounded.forEach((count, tokens) => {
    const reach = max(minNeighborhood, round(tokens * neighborhoodShare));

    const high = tokens + reach;
    const low = tokens - reach;

    const start = lowerBound({sorted, value: low}).index;
    const end = lowerBound({sorted, value: high + 1}).index;

    const highRound = floor(high / roundTokensMultiple);
    const lowRound = ceil(low / roundTokensMultiple);

    const values = reach * 2 + 1 - (highRound - lowRound + 1);

    const expected = (end - start) / max(1, values);

    counts[binFor(tokens)] += min(count, expected);
  });

  const total = counts.reduce((sum, count) => sum + count, Number());

  return {
    bins: counts.map(count => !total ? 0 : count / total),
    bins_per_decade: binsPerDecade,
  };
};
