const {half} = require('./../constants');
const {tokensPerBigUnit} = require('./../constants');

const {log10} = Math;
const {pow} = Math;
const {round} = Math;

/** Make a fine histogram of the prices implied by outputs near round amounts

  {
    amounts: [<Round USD Amount Number>]
    bins_per_decade: <Bins Per Factor of Ten Number>
    outputs: [<Output Tokens Number>]
    price: <Rough USD Price Number>
    reach: <Bins On Either Side of the Rough Price Number>
    weights: [<Round USD Amount Weight Number>]
  }

  @returns
  {
    counts: [<Implied Prices In Bin Count Number>]
    weighted: [<Weighted Implied Prices In Bin Number>]
  }
*/
module.exports = args => {
  const binsPerDecade = args.bins_per_decade;
  const counts = Array(args.reach * 2 + 1).fill(Number());
  const maxRatio = pow(10, (args.reach + half) / args.bins_per_decade);
  const weighted = Array(args.reach * 2 + 1).fill(Number());

  // Round amounts are further apart than the reach, so an output fits one
  args.outputs.forEach(tokens => {
    const paid = args.price * tokens / tokensPerBigUnit;

    return args.amounts.forEach((usd, index) => {
      const ratio = usd / paid;

      // Exit early when the output is not near this round amount
      if (ratio >= maxRatio || ratio <= 1 / maxRatio) {
        return;
      }

      const bin = args.reach + round(log10(ratio) * binsPerDecade);

      counts[bin]++;
      weighted[bin] += args.weights[index];
    });
  });

  return {counts, weighted};
};
