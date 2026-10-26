const peakAroundPrice = require('./peak_around_price');

const {abs} = Math;
const defaultReach = 37;
const maxIterations = 5;
const settledBins = 0.5;

/** Refine a rough price to the center of the peak of round payments

  {
    amounts: [<Round USD Amount Number>]
    outputs: [<Output Tokens Number>]
    price: <Rough USD Price Number>
    [reach]: <Fine Bins On Either Side of the Price to Consider Number>
    weights: [<Round USD Amount Weight Number>]
  }

  @returns
  {
    dispersion: <Peak Width Beyond Smoothing As Price Fraction Number>
    is_at_edge: <Peak Is At the Edge of the Refinement Range Bool>
    [is_unsettled]: <Peak Was Still Moving After the Last Pass Bool>
    iterations: <Recentering Passes Count Number>
    noise: <Largest Payments Count Away From the Peak Number>
    payments: <Estimated Round Payments In the Peak Number>
    price: <Refined USD Price Number>
    significance: <Peak Payments Beyond Noise In Standard Deviations Number>
    spread: <Smoothed Peak Width At Half Height As a Fraction of Price Number>
  }
*/
module.exports = ({amounts, outputs, price, reach, weights}) => {
  const reachBins = reach || defaultReach;

  // Recenter on the peak until it settles
  const passes = [...Array(maxIterations).keys()].reduce(passes => {
    const [latest] = passes;

    const isSettled = !!latest && abs(latest.offset) < settledBins;

    // Exit early when the peak has settled or cannot be followed
    if (isSettled || (!!latest && latest.is_at_edge)) {
      return passes;
    }

    const pass = peakAroundPrice({
      amounts,
      outputs,
      weights,
      price: !latest ? price : latest.price,
      reach: reachBins,
    });

    return [pass].concat(passes);
  },
  []);

  const [final] = passes;

  // A peak still moving after the last pass did not settle
  const isUnsettled = !final.is_at_edge && abs(final.offset) >= settledBins;

  return {
    dispersion: final.dispersion,
    is_at_edge: final.is_at_edge,
    is_unsettled: isUnsettled || undefined,
    iterations: passes.length,
    noise: final.noise,
    payments: final.payments,
    price: final.price,
    significance: final.significance,
    spread: final.spread,
  };
};
