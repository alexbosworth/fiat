const {kernelBins} = require('./../constants');

/** Score a dollar position by the strength of its spikes above their noise

  {
    dollar_bin: <Bin Where One Dollar Lands Number>
    min_bin: <Lowest Observable Bin Number>
    noise: [<Spike Strength From Noise Alone At Bin Number>]
    shifts: [<Bins Above the Dollar Bin of Round USD Amount Number>]
    strengths: [<Spike Strength At Bin Number>]
    weights: [<Amount Weight Number>]
  }

  @returns
  {
    score: <Weighted Strength of Observable Spikes Above Noise Number>
  }
*/
module.exports = args => {
  const {noise, shifts, strengths, weights} = args;

  const score = shifts.reduce((sum, shift, index) => {
    const center = args.dollar_bin + shift;

    const isAbove = center + kernelBins >= strengths.length;
    const isBelow = center - kernelBins < args.min_bin;

    // Exit early when the whole spike of the amount is not in the histogram
    if (isAbove || isBelow) {
      return sum;
    }

    return sum + (strengths[center] - noise[center]) * weights[index];
  },
  Number());

  return {score};
};
