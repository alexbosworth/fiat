const {methodVersion} = require('./../known');

const isCounted = n => !!n.is_supported && !n.is_widened;

/** Make the record of a price estimate that is reported for remembering

  {
    date: <Day YYYY-MM-DD String>
    estimate: {
      agreement: <Spike Strengths Agreement With Template Weights Number>
      blocks: [<First Block Height Number>, <Last Block Height Number>]
      cents: <USD Cents Per BTC Number>
      confidence: <Best Position Score Over Best Alias Position Score Number>
      coverage: <Share of Spike Excess At Round USD Positions Number>
      dispersion: <Peak Width Beyond Smoothing As Price Fraction Number>
      [drift]: <Second Half Price Change From First Half Price Number>
      evidence: <Share of Prior Weight Observable At the Price Number>
      hash: <Last Block Hash Hex String>
      [is_unsettled]: <Refinement Was Still Moving After Its Last Pass Bool>
      [is_widened]: <Search Was Widened Beyond the Price Window Bool>
      outputs: <Payment Outputs Considered Count Number>
      payments: <Estimated Round USD Payments Count Number>
      rivalry: <Best Patterned Rival Position Score Over Best Score Number>
      round_shift: <Price Change If Round BTC Values Were Counted Number>
      significance: <Payment Peak Beyond Noise In Standard Deviations Number>
      spikes: [{
        strength: <Spike Strength Relative to the Strongest Spike Number>
        usd: <Round USD Amount Number>
      }]
      stability: <Largest Price Change From Perturbed Refinement Number>
      [windows]: [{
        is_supported: <Window Price Is Supported By the Data Bool>
        [is_widened]: <Search Was Widened Beyond the Price Window Bool>
      }]
    }
    [is_provisional]: <Price Is For An Incomplete Day Bool>
    [is_sample]: <Price Is A Rough Estimate From Sample Blocks Bool>
    [is_unguided]: <Price Was Estimated Without a Neighboring Guide Bool>
  }

  @returns
  {
    record: {
      agreement: <Spike Strengths Agreement With Template Weights Number>
      blocks: [<First Block Height Number>, <Last Block Height Number>]
      cents: <USD Cents Per BTC Number>
      confidence: <Best Position Score Over Best Alias Position Score Number>
      coverage: <Share of Spike Excess At Round USD Positions Number>
      date: <Day YYYY-MM-DD String>
      dispersion: <Peak Width Beyond Smoothing As Price Fraction Number>
      [drift]: <Second Half Price Change From First Half Price Number>
      evidence: <Share of Prior Weight Observable At the Price Number>
      hash: <Last Block Hash Hex String>
      [is_provisional]: <Price Is For An Incomplete Day Bool>
      [is_sample]: <Price Is A Rough Estimate From Sample Blocks Bool>
      [is_unguided]: <Price Was Estimated Without a Neighboring Guide Bool>
      [is_unsettled]: <Refinement Was Still Moving After Its Last Pass Bool>
      [is_widened]: <Search Was Widened Beyond the Price Window Bool>
      outputs: <Payment Outputs Considered Count Number>
      payments: <Estimated Round USD Payments Count Number>
      rivalry: <Best Patterned Rival Position Score Over Best Score Number>
      round_shift: <Price Change If Round BTC Values Were Counted Number>
      significance: <Payment Peak Beyond Noise In Standard Deviations Number>
      spikes: [{
        strength: <Spike Strength Relative to the Strongest Spike Number>
        usd: <Round USD Amount Number>
      }]
      stability: <Largest Price Change From Perturbed Refinement Number>
      version: <Method Version String>
      [windows]: <Supported Windows Inside the Price Window Count Number>
    }
  }
*/
module.exports = args => {
  const {date, estimate} = args;

  const counted = (estimate.windows || []).filter(isCounted);

  return {
    record: {
      date,
      agreement: estimate.agreement,
      blocks: estimate.blocks,
      cents: estimate.cents,
      confidence: estimate.confidence,
      coverage: estimate.coverage,
      dispersion: estimate.dispersion,
      drift: estimate.drift,
      evidence: estimate.evidence,
      hash: estimate.hash,
      is_provisional: args.is_provisional || undefined,
      is_sample: args.is_sample || undefined,
      is_unguided: args.is_unguided || undefined,
      is_unsettled: estimate.is_unsettled || undefined,
      is_widened: estimate.is_widened || undefined,
      outputs: estimate.outputs,
      payments: estimate.payments,
      rivalry: estimate.rivalry,
      round_shift: estimate.round_shift,
      significance: estimate.significance,
      spikes: estimate.spikes,
      stability: estimate.stability,
      version: methodVersion({}).version,
      windows: !estimate.windows ? undefined : counted.length,
    },
  };
};
