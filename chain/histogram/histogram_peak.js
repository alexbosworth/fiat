const {half} = require('./../constants');
const histogramExcess = require('./histogram_excess');
const parabolaPeak = require('./parabola_peak');
const paymentsNearPosition = require('./payments_near_position');
const peakWidth = require('./peak_width');
const smoothBins = require('./smooth_bins');

const {abs} = Math;
const {ceil} = Math;
const {max} = Math;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);
const {round} = Math;
const {sqrt} = Math;

/** Find the peak in a fine histogram of implied prices

  {
    counts: [<Implied Prices In Bin Count Number>]
    exclude: <Bins Next to a Bin to Leave Out of Its Background Number>
    kernel: <Smoothing Kernel Half Width in Bins Number>
    weighted: [<Weighted Implied Prices In Bin Number>]
  }

  @returns
  {
    delta: <Peak Offset From the Peak Bin In Bins Number>
    noise: <Largest Payments Count Away From the Peak Number>
    payments: <Estimated Round Payments In the Peak Number>
    peak: <Peak Bin Index Number>
    significance: <Peak Payments Beyond Noise In Standard Deviations Number>
    width: <Peak Width At Half of Its Height in Bins Number>
  }
*/
module.exports = ({counts, exclude, kernel, weighted}) => {
  const radius = counts.length;

  const {excess} = histogramExcess({exclude, radius, bins: weighted});

  // Smoothing the excess gathers the peak into one place
  const {smoothed} = smoothBins({half: kernel, bins: excess});

  const peak = smoothed.indexOf(max(...smoothed));

  const after = smoothed[peak + 1];
  const before = smoothed[peak - 1];
  const center = smoothed[peak];

  const {delta} = parabolaPeak({
    center,
    above: after === undefined ? center : after,
    below: before === undefined ? center : before,
  });

  const {background} = histogramExcess({exclude, radius, bins: counts});

  const {width} = peakWidth({peak, bins: smoothed});

  const {above, observed} = paymentsNearPosition({
    background,
    counts,
    kernel,
    position: peak,
  });

  // Every other position that does not overlap the peak is a noise peak
  const apart = ceil(width * half) + kernel;

  const noise = range(Number(), counts.length)
    .filter(position => abs(position - peak) > apart)
    .map(position => {
      return paymentsNearPosition({background, counts, kernel, position});
    })
    .map(payments => payments.above)
    .reduce((largest, n) => max(largest, n), Number());

  // Significance is the payments beyond noise in standard deviations
  const beyond = max(Number(), above - noise);

  return {
    delta,
    peak,
    width,
    noise: round(noise),
    payments: max(Number(), round(above)),
    significance: !observed ? Number() : beyond / sqrt(observed),
  };
};
