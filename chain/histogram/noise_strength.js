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
  const limit = min(args.excess.length, args.center + noiseRadius + 1);
  const start = max(Number(), args.min_bin, args.center - noiseRadius);

  const aboveStart = max(start, args.center + kernelBins + 1);
  const belowEnd = max(start, args.center - kernelBins);
  const end = max(start, limit);

  // The neighbors on each side, leaving out the spike itself
  const above = args.excess.slice(aboveStart, end);
  const below = args.excess.slice(start, belowEnd);

  const sorted = below.concat(above).sort((a, b) => a - b);

  return noiseOfNeighbors({sorted});
};
