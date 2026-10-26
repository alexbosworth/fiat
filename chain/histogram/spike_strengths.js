const {spikeKernel} = require('./../constants');

const half = (spikeKernel.length - 1) / 2;
const {isArray} = Array;

/** Measure the strength of a spike centered at each bin of a histogram

  {
    excess: [<Share of Outputs Above Local Background Number>]
  }

  @throws
  <Error>

  @returns
  {
    strengths: [<Spike Strength At Bin Number>]
  }
*/
module.exports = ({excess}) => {
  if (!isArray(excess)) {
    throw new Error('ExpectedHistogramExcessToMeasureSpikeStrengths');
  }

  const strengths = excess.map((share, center) => {
    return spikeKernel.reduce((sum, weight, offset) => {
      return sum + weight * (excess[center + offset - half] || 0);
    },
    0);
  });

  return {strengths};
};
