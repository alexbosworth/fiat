const {kernelBins} = require('./../constants');
const noiseOfNeighbors = require('./noise_of_neighbors');
const {noiseRadius} = require('./../constants');

const {max} = Math;
const {min} = Math;

/** Get the strength that noise alone would give a spike at a center

  {
    center: <Spike Center Bin Number>
    excess: [<Share of Outputs Above Local Background Number>]
    min_bin: <Lowest Observable Bin Number>
  }

  @returns
  {
    noise: <Spike Strength From Noise Alone Number>
  }
*/
module.exports = args => {
  const {center, excess} = args;

  const start = max(Number(), args.min_bin, center - noiseRadius);

  const end = max(start, min(excess.length, center + noiseRadius + 1));

  // The neighbors on each side, leaving out the spike itself
  const below = excess.slice(start, max(start, center - kernelBins));
  const above = excess.slice(max(start, center + kernelBins + 1), end);

  const sorted = below.concat(above).sort((a, b) => a - b);

  return noiseOfNeighbors({sorted});
};
