const rounded = n => Math.round(n * 1e3) / 1e3;

/** Remember a price estimate with the known estimates

  {
    estimate: {
      [agreement]: <Spike Strengths Agreement With Template Weights Number>
      [blocks]: [<First Block Height Number>, <Last Block Height Number>]
      cents: <USD Cents Per BTC Number>
      [confidence]: <Best Position Score Over Best Alias Score Number>
      date: <Day YYYY-MM-DD String>
      [dispersion]: <Peak Width Beyond Smoothing As Price Fraction Number>
      [drift]: <Second Half Price Change From First Half Price Number>
      [evidence]: <Share of Prior Weight Observable At the Price Number>
      [hash]: <Last Block Hash Hex String>
      [is_provisional]: <Price Is For An Incomplete Day Bool>
      [is_sample]: <Price Is A Rough Estimate From Sample Blocks Bool>
      [is_unguided]: <Price Was Estimated Without a Neighboring Guide Bool>
      [is_unsettled]: <Refinement Was Still Moving After Its Last Pass Bool>
      [outputs]: <Payment Outputs Considered Count Number>
      [payments]: <Estimated Round USD Payments Count Number>
      [rivalry]: <Best Rival Position Score Over Best Score Number>
      [round_shift]: <Price Change If Round BTC Values Were Counted Number>
      [stability]: <Largest Price Change From Perturbed Refinement Number>
      [version]: <Method Version String>
    }
    estimates: {
      priors: {<Day YYYY-MM-DD String>: <Estimate Object>}
      provisional: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
      rates: {<Day YYYY-MM-DD String>: <Estimate Object>}
    }
  }

  @returns
  {
    estimates: {
      priors: {<Day YYYY-MM-DD String>: <Estimate Object>}
      provisional: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
      rates: {<Day YYYY-MM-DD String>: <Estimate Object>}
    }
  }
*/
module.exports = ({estimate, estimates}) => {
  const {blocks, cents, date, hash, version} = estimate;

  // Exit early when the estimate is provisional
  if (!!estimate.is_provisional) {
    estimates.provisional[date] = {blocks, cents, hash, version};

    return {estimates};
  }

  // Exit early when the estimate is only a rough guide
  if (!!estimate.is_sample) {
    estimates.priors[date] = {blocks, cents, hash, version};

    return {estimates};
  }

  estimates.rates[date] = {
    blocks,
    cents,
    hash,
    version,
    agreement: rounded(estimate.agreement),
    confidence: rounded(estimate.confidence),
    dispersion: rounded(estimate.dispersion),
    drift: estimate.drift === undefined ? undefined : rounded(estimate.drift),
    evidence: rounded(estimate.evidence),
    is_unguided: estimate.is_unguided || undefined,
    is_unsettled: estimate.is_unsettled || undefined,
    outputs: estimate.outputs,
    payments: estimate.payments,
    rivalry: rounded(estimate.rivalry),
    round_shift: rounded(estimate.round_shift),
    stability: rounded(estimate.stability),
  };

  // A full day rate replaces the prior estimate of its day
  delete estimates.priors[date];

  return {estimates};
};
