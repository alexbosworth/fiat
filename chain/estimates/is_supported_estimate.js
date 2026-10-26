const {minAliasMargin} = require('./../constants');

const clearMargin = 0.1;
const {isArray} = Array;
const maxRivalry = 0.9;
const maxStability = 0.01;
const minEvidence = 0.5;
const minPayments = 100;
const minSignificance = 4;
const minSpikes = 3;
const minSpikeStrength = 0.2;

/** Determine if a price estimate is supported by the data behind it

  {
    confidence: <Best Position Score Over Best Patterned Alias Score Number>
    evidence: <Share of Prior Weight Observable At the Price Number>
    is_unconstrained: <Search Was Not Confined To a Window Bool>
    payments: <Estimated Round USD Payments Count Number>
    rivalry: <Best Patterned Rival Position Score Over Best Score Number>
    significance: <Payment Peak Beyond Noise In Standard Deviations Number>
    spikes: [{
      strength: <Spike Strength Relative to the Strongest Spike Number>
      usd: <Round USD Amount Number>
    }]
    stability: <Largest Price Change From Perturbed Refinement Number>
  }

  @returns
  {
    is_supported: <Estimate Is Supported By the Data Bool>
  }
*/
module.exports = args => {
  const {confidence, evidence, payments, rivalry, significance} = args;

  // Exit early when there are no spikes to judge
  if (!isArray(args.spikes)) {
    return {is_supported: false};
  }

  const strong = args.spikes.filter(n => n.strength >= minSpikeStrength);

  // Exit early when there is no pattern, one spike fits any round amount
  if (strong.length < minSpikes) {
    return {is_supported: false};
  }

  // Exit early when too few round payments formed the peak
  if (!(payments >= minPayments)) {
    return {is_supported: false};
  }

  // Exit early when the peak does not stand out beyond noise
  if (!(significance >= minSignificance)) {
    return {is_supported: false};
  }

  // Exit early when other starting points refine to another price
  if (!(args.stability < maxStability)) {
    return {is_supported: false};
  }

  // Exit early when another position or currency fits nearly as well
  if (!(rivalry < maxRivalry)) {
    return {is_supported: false};
  }

  // Exit early when too little of the pattern was observable
  if (!(evidence >= minEvidence)) {
    return {is_supported: false};
  }

  // Less observable evidence demands a larger margin over the aliases
  const clear = minAliasMargin + clearMargin / evidence;

  // Without a window around a known price only the prior excludes aliases
  const minConfidence = !!args.is_unconstrained ? clear : minAliasMargin;

  return {is_supported: confidence >= minConfidence};
};
