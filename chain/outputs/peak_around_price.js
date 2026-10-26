const {histogramPeak} = require('./../histogram');
const {impliedPricesHistogram} = require('./../histogram');
const {kernelWidth} = require('./../histogram');

const {ceil} = Math;
const defaultKernel = 8;
const exclusionMargin = 4;
const fineBinsPerDecade = 1000;
const {max} = Math;
const maxKernel = 12;
const {min} = Math;
const {pow} = Math;
const {sqrt} = Math;

/** Find the peak of round payments in a fine histogram centered on a price

  {
    amounts: [<Round USD Amount Number>]
    outputs: [<Output Tokens Number>]
    price: <Center USD Price Number>
    reach: <Bins On Each Side of the Center Number>
    weights: [<Round USD Amount Weight Number>]
  }

  @returns
  {
    dispersion: <Peak Width Beyond Smoothing As Price Fraction Number>
    is_at_edge: <Peak Is At the Edge of the Histogram Bool>
    noise: <Background Noise Number>
    offset: <Peak Offset From Center In Bins Number>
    payments: <Estimated Round USD Payments Count Number>
    price: <Peak USD Price Number>
    significance: <Payment Peak Beyond Noise In Standard Deviations Number>
    spread: <Smoothed Peak Width At Half Height As a Fraction of Price Number>
  }
*/
module.exports = ({amounts, outputs, price, reach, weights}) => {
  const {counts, weighted} = impliedPricesHistogram({
    amounts,
    outputs,
    price,
    reach,
    weights,
    bins_per_decade: fineBinsPerDecade,
  });

  const first = histogramPeak({
    counts,
    weighted,
    exclude: defaultKernel + exclusionMargin,
    kernel: defaultKernel,
  });

  // A wide peak gets wider smoothing, up to a limit
  const wide = max(defaultKernel, ceil(first.width / 2));

  const kernel = min(maxKernel, wide);

  const resmoothing = {
    counts,
    kernel,
    weighted,
    exclude: kernel + exclusionMargin,
  };

  // The default kernel was already used to find the first peak
  const peak = kernel === defaultKernel ? first : histogramPeak(resmoothing);

  const offset = peak.peak + peak.delta - reach;

  // The width the smoothing alone would give is taken out in quadrature
  const smoothing = kernelWidth({half: kernel}).width;

  const beyond = sqrt(max(Number(), peak.width ** 2 - smoothing ** 2));

  return {
    offset,
    dispersion: pow(10, beyond / fineBinsPerDecade) - 1,
    is_at_edge: peak.peak < kernel || peak.peak > reach * 2 - kernel,
    noise: peak.noise,
    payments: peak.payments,
    price: price * pow(10, offset / fineBinsPerDecade),
    significance: peak.significance,
    spread: pow(10, peak.width / fineBinsPerDecade) - 1,
  };
};
