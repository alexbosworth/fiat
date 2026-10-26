const peakWidth = require('./peak_width');
const smoothBins = require('./smooth_bins');

const spike = 1;

/** Measure the width that smoothing alone gives a single bin spike

  {
    half: <Kernel Half Width in Bins Number>
  }

  @returns
  {
    width: <Smoothed Single Bin Spike Width At Half Height in Bins Number>
  }
*/
module.exports = ({half}) => {
  const positions = [...Array(half * 2 + 1).keys()];

  const bins = positions.map(i => i === half ? spike : 0);

  const {smoothed} = smoothBins({half, bins});

  return {width: peakWidth({peak: half, bins: smoothed}).width};
};
