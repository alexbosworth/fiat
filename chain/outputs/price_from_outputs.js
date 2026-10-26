const {defaultMaxPrice} = require('./../constants');
const {defaultMinPrice} = require('./../constants');
const estimateFromOutputs = require('./estimate_from_outputs');
const {isRoundTokens} = require('./../histogram');

const {abs} = Math;
const {isArray} = Array;
const isTokens = n => Number.isSafeInteger(n) && n > 0;

/** Estimate the USD price of BTC from the values of payment outputs

  {
    [is_capping_near_round]: <Cap Values Just Off Round BTC Amounts Too Bool>
    [max_price]: <Maximum Possible USD Price Number>
    [min_price]: <Minimum Possible USD Price Number>
    outputs: [<Output Tokens Number>]
  }

  @throws
  <Error>

  @returns
  {
    agreement: <Spike Strengths Agreement With Prior Weights Number>
    cents: <USD Cents Per BTC Number>
    confidence: <Best Position Score Over Best Patterned Alias Score Number>
    coverage: <Share of Spike Excess At Round USD Positions Number>
    dispersion: <Peak Width Beyond Smoothing As Price Fraction Number>
    evidence: <Share of Prior Weight Observable At the Price Number>
    is_at_edge: <Best Position Is At the Edge of the Price Window Bool>
    [is_unsettled]: <Refinement Was Still Moving After Its Last Pass Bool>
    noise: <Largest Payments Count Away From the Peak Number>
    payments: <Estimated Round USD Payments Count Number>
    rivalry: <Best Patterned Rival Position Score Over Best Score Number>
    rough_cents: <Rough Estimate USD Cents Per BTC Number>
    round_shift: <Price Change If Round BTC Values Were Counted Number>
    significance: <Payment Peak Beyond Noise In Standard Deviations Number>
    spikes: [{
      strength: <Spike Strength Relative to the Strongest Spike Number>
      usd: <Round USD Amount Number>
    }]
    stability: <Largest Price Change From Perturbed Refinement Number>
  }
*/
module.exports = args => {
  if (!isArray(args.outputs) || !args.outputs.length) {
    throw new Error('ExpectedOutputTokenValuesToDerivePriceFromOutputs');
  }

  const maxPrice = args.max_price || defaultMaxPrice;
  const minPrice = args.min_price || defaultMinPrice;

  if (!(minPrice > 0) || !(maxPrice > minPrice)) {
    throw new Error('ExpectedValidPriceRangeToDerivePriceFromOutputs');
  }

  const outputs = args.outputs.filter(isTokens);

  if (!outputs.some(tokens => !isRoundTokens({tokens}).is_round)) {
    throw new Error('ExpectedNonRoundOutputValuesToDerivePriceFromOutputs');
  }

  // Round USD payments line up at the price, see docs/METHODOLOGY.md
  const estimate = estimateFromOutputs({
    outputs,
    is_capping_near_round: args.is_capping_near_round,
    max_price: maxPrice,
    min_price: minPrice,
  });

  // Counting round BTC values in full shows what the correction changes
  const counted = estimateFromOutputs({
    outputs,
    is_counting_round: true,
    is_quick: true,
    max_price: maxPrice,
    min_price: minPrice,
  });

  return {
    agreement: estimate.agreement,
    cents: estimate.cents,
    confidence: estimate.confidence,
    coverage: estimate.coverage,
    dispersion: estimate.dispersion,
    evidence: estimate.evidence,
    is_at_edge: estimate.is_at_edge,
    is_unsettled: estimate.is_unsettled,
    noise: estimate.noise,
    payments: estimate.payments,
    rivalry: estimate.rivalry,
    rough_cents: estimate.rough_cents,
    round_shift: abs(counted.cents / estimate.cents - 1),
    significance: estimate.significance,
    spikes: estimate.spikes,
    stability: estimate.stability || Number(),
  };
};
