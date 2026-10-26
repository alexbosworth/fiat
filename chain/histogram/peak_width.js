const {half} = require('./../constants');

/** Measure the width of a peak in histogram bins at half of its height

  {
    bins: [<Bin Value Number>]
    peak: <Peak Bin Index Number>
  }

  @returns
  {
    width: <Contiguous Bins At or Above Half the Peak Height Count Number>
  }
*/
module.exports = ({bins, peak}) => {
  const threshold = (bins[peak] || 0) * half;

  // Exit early when there is no peak
  if (!threshold) {
    return {width: Number()};
  }

  const isHigh = bin => bins[bin] !== undefined && bins[bin] >= threshold;

  const lower = bins.slice(Number(), peak).reverse();

  const left = lower.findIndex((value, gap) => !isHigh(peak - gap - 1));

  const higher = bins.slice(peak + 1);

  const right = higher.findIndex((value, gap) => !isHigh(peak + gap + 1));

  const before = left === -1 ? peak : left;
  const after = right === -1 ? bins.length - peak - 1 : right;

  return {width: before + after + 1};
};
