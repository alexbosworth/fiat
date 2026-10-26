const {kernelBins} = require('./../constants');

const {isArray} = Array;
const {log10} = Math;
const {max} = Math;
const minPatternSpikes = 3;
const minPatternStrength = 0.2;
const {round} = Math;

/** Score a dollar position of the round USD pattern against histogram excess

  {
    amounts: [<Round USD Amount Number>]
    bins_per_decade: <Bins Per Factor of Ten Number>
    dollar_bin: <Bin Where One Dollar Lands Number>
    min_bin: <Lowest Observable Bin Number>
    noise: [<Spike Strength From Noise Alone At Bin Number>]
    strengths: [<Spike Strength At Bin Number>]
    weights: [<Amount Weight Number>]
  }

  @throws
  <Error>

  @returns
  {
    evidence: <Share of Weight That Was Observable Number>
    is_pattern: <Position Shows a Multi-Denomination Pattern Bool>
    observable: [<Amount Is Observable Bool>]
    score: <Weighted Strength of Observable Spikes Above Noise Number>
    strengths: [<Observable Spike Strength Above Noise or Zero Number>]
  }
*/
module.exports = args => {
  if (!isArray(args.strengths)) {
    throw new Error('ExpectedSpikeStrengthsToScorePosition');
  }

  if (!isArray(args.noise)) {
    throw new Error('ExpectedNoiseStrengthsToScorePosition');
  }

  if (args.noise.length !== args.strengths.length) {
    throw new Error('ExpectedNoiseStrengthOfEveryBinToScorePosition');
  }

  const {amounts, strengths, weights} = args;

  const binsPerDecade = args.bins_per_decade;
  const dollarBin = args.dollar_bin;

  const centers = amounts.map(usd => {
    return dollarBin + round(log10(usd) * binsPerDecade);
  });

  // An amount is observable when its whole spike is within the histogram
  const observable = centers.map(center => {
    const high = center + kernelBins < strengths.length;
    const low = center - kernelBins >= args.min_bin;

    return high && low;
  });

  // Spike strengths above the strength that noise alone would give them
  const above = centers.map((center, index) => {
    // Exit early when the amount cannot be seen at this position
    if (!observable[index]) {
      return Number();
    }

    return strengths[center] - args.noise[center];
  });

  const observedWeight = weights.reduce((sum, weight, index) => {
    return sum + (!observable[index] ? 0 : weight);
  },
  Number());

  const totalWeight = weights.reduce((sum, weight) => sum + weight, Number());

  const observed = above.map(n => max(Number(), n));

  const strongest = max(...observed);

  const spikes = observed.filter(n => n >= strongest * minPatternStrength);

  return {
    observable,
    evidence: !totalWeight ? 0 : observedWeight / totalWeight,
    is_pattern: !!strongest && spikes.length >= minPatternSpikes,
    score: above.reduce((sum, n, i) => sum + n * weights[i], Number()),
    strengths: observed,
  };
};
