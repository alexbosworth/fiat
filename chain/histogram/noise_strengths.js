const {kernelBins} = require('./../constants');
const noiseOfNeighbors = require('./noise_of_neighbors');
const {noiseRadius} = require('./../constants');
const sortedNeighbors = require('./sorted_neighbors');

/** Get the strength that noise alone would give a spike at each bin

  {
    excess: [<Share of Outputs Above Local Background Number>]
    min_bin: <Lowest Observable Bin Number>
  }

  @returns
  {
    noise: [<Spike Strength From Noise Alone Number>]
  }
*/
module.exports = args => {
  // The neighbors of a bin are near it, leaving out the spike itself
  const {values} = sortedNeighbors({
    bins: args.excess,
    exclude: kernelBins,
    min_bin: args.min_bin,
    radius: noiseRadius,
    value: sorted => noiseOfNeighbors({sorted}).noise,
  });

  return {noise: values};
};
