const parabolaPeak = require('./parabola_peak');
const positionScore = require('./position_score');

const {log10} = Math;
const {round} = Math;

/** Find the best scoring dollar position among positions under a weighting

  {
    amounts: [<Round USD Amount Number>]
    bins: [<Dollar Position Bin Number>]
    bins_per_decade: <Bins Per Factor of Ten Number>
    min_bin: <Lowest Observable Bin Number>
    noise: [<Spike Strength From Noise Alone At Bin Number>]
    strengths: [<Spike Strength At Bin Number>]
    weights: [<Amount Weight Number>]
  }

  @returns
  {
    bin: <Best Scoring Dollar Position Bin Number>
    delta: <Peak Offset From the Best Bin In Bins Number>
    score: <Best Score Number>
  }
*/
module.exports = args => {
  const {noise, strengths, weights} = args;

  // The bins of the amounts above a dollar bin are the same at every position
  const shifts = args.amounts.map(usd => {
    return round(log10(usd) * args.bins_per_decade);
  });

  const scores = args.bins.map(bin => {
    const {score} = positionScore({
      noise,
      shifts,
      strengths,
      weights,
      dollar_bin: bin,
      min_bin: args.min_bin,
    });

    return {bin, score};
  });

  // The first of the highest scores is the best
  const best = scores.reduce((lead, n) => n.score > lead.score ? n : lead);

  const index = scores.indexOf(best);

  // The peak is between the best bin and its neighbors
  const above = scores[index + 1] || best;
  const below = scores[index - 1] || best;

  const {delta} = parabolaPeak({
    above: above.score,
    below: below.score,
    center: best.score,
  });

  return {delta, bin: best.bin, score: best.score};
};
