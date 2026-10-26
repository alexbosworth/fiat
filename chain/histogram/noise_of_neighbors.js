const {ceil} = Math;
const noiseTrimShare = 0.2;
const spikeKernelSum = 3;

/** Get the strength that noise alone would give a spike from its neighbors

  {
    sorted: [<Neighbor Share In Ascending Order Number>]
  }

  @returns
  {
    noise: <Spike Strength From Noise Alone Number>
  }
*/
module.exports = ({sorted}) => {
  // The highest shares nearby are left out, they can be other spikes
  const keep = ceil(sorted.length * (1 - noiseTrimShare));

  // Exit early when there are no neighbors to measure noise from
  if (!keep) {
    return {noise: Number()};
  }

  const sum = sorted.reduce((total, n, i) => i < keep ? total + n : total, 0);

  return {noise: spikeKernelSum * (sum / keep)};
};
