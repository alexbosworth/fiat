const {abs} = Math;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);

/** Smooth histogram bins with a triangular kernel

  {
    bins: [<Bin Value Number>]
    half: <Kernel Half Width in Bins Number>
  }

  @returns
  {
    smoothed: [<Smoothed Bin Value Number>]
  }
*/
module.exports = ({bins, half}) => {
  const offsets = range(-half, half + 1);

  const smoothed = bins.map((value, bin) => {
    return offsets.reduce((sum, offset) => {
      const weight = 1 - abs(offset) / (half + 1);

      return sum + weight * (bins[bin + offset] || 0);
    },
    Number());
  });

  return {smoothed};
};
