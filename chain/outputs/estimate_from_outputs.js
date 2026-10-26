const aliasShifts = require('./alias_shifts');
const {bestPosition} = require('./../histogram');
const capNearRoundValues = require('./cap_near_round_values');
const capRepeatedValues = require('./cap_repeated_values');
const {centsPerDollar} = require('./../constants');
const dollarBinForPrice = require('./dollar_bin_for_price');
const {histogramExcess} = require('./../histogram');
const {isRoundTokens} = require('./../histogram');
const {kernelBins} = require('./../constants');
const {minTokens} = require('./../constants');
const {noiseStrengths} = require('./../histogram');
const {outputsHistogram} = require('./../histogram');
const priceForDollarBin = require('./price_for_dollar_bin');
const refinePrice = require('./refine_price');
const roundAmounts = require('./round_amounts');
const {scorePosition} = require('./../histogram');
const {spikeStrengths} = require('./../histogram');
const {templateAgreement} = require('./../histogram');

const {abs} = Math;
const aliasSearchBins = 2;
const {assign} = Object;
const {ceil} = Math;
const edgeBins = 3;
const flatten = arr => [].concat(...arr);
const {floor} = Math;
const isRound = tokens => isRoundTokens({tokens}).is_round;
const {log10} = Math;
const {max} = Math;
const maxConfidence = 100;
const maxPossiblePrice = 1e7;
const maxRivalBins = 57;
const {min} = Math;
const minPossiblePrice = 1e2;
const minRivalBins = 4;
const {pow} = Math;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);
const {round} = Math;
const shortReach = 25;
const startShifts = [0.97, 1.03];

/** Estimate the USD price of BTC from payment output values

  {
    [is_capping_near_round]: <Cap Values Just Off Round BTC Amounts Too Bool>
    [is_counting_round]: <Count Round BTC Values In Full Bool>
    [is_quick]: <Skip the Stability Check Bool>
    max_price: <Maximum Possible USD Price Number>
    min_price: <Minimum Possible USD Price Number>
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
    significance: <Payment Peak Beyond Noise In Standard Deviations Number>
    spikes: [{
      strength: <Spike Strength Relative to the Strongest Spike Number>
      usd: <Round USD Amount Number>
    }]
    [stability]: <Largest Price Change From Perturbed Refinement Number>
  }
*/
module.exports = args => {
  const isCapping = !!args.is_capping_near_round && !args.is_counting_round;

  // Repeats of an exact amount beyond a few are not counted
  const spread = capRepeatedValues({outputs: args.outputs});

  const {outputs} = spread;

  // Values just off round amounts of BTC are capped as well when asked
  const kept = !isCapping ? spread : capNearRoundValues({outputs});

  const histogram = outputsHistogram({
    is_counting_round: args.is_counting_round,
    outputs: kept.outputs,
  });

  if (!histogram.bins.some(share => !!share)) {
    throw new Error('ExpectedOutputsInAnalysisRangeToDerivePriceFromOutputs');
  }

  const {amounts, weights} = roundAmounts({});
  const binsPerDecade = histogram.bins_per_decade;
  const {excess} = histogramExcess({bins: histogram.bins});
  const minBin = round(log10(minTokens) * histogram.bins_per_decade);

  // The strength that noise alone gives a spike at each bin of the histogram
  const {noise} = noiseStrengths({excess, min_bin: minBin});

  // The strength of a spike centered at each bin of the histogram
  const {strengths} = spikeStrengths({excess});

  const isCountingRound = !!args.is_counting_round;

  // Round values are only refined on when they are counted in full
  const refining = kept.outputs.filter(n => isCountingRound || !isRound(n));

  // The histogram that every dollar position is scored against
  const histogramArgs = {
    amounts,
    noise,
    strengths,
    bins_per_decade: binsPerDecade,
    min_bin: minBin,
  };

  // Score a dollar position under a weighting of the template
  const scoreAt = ({bin, weighting}) => {
    return scorePosition({
      amounts,
      noise,
      strengths,
      bins_per_decade: binsPerDecade,
      dollar_bin: bin,
      min_bin: minBin,
      weights: weighting,
    });
  };

  // Higher prices put a dollar in lower bins, so the window is reversed
  const lowDollarBin = floor(dollarBinForPrice({
    bins_per_decade: binsPerDecade,
    price: args.max_price,
  })
  .bin);

  const highDollarBin = ceil(dollarBinForPrice({
    bins_per_decade: binsPerDecade,
    price: args.min_price,
  })
  .bin);

  const positions = range(lowDollarBin, highDollarBin + 1);

  // Find the alignment of the pattern using the prior weights
  const prior = bestPosition(assign({}, histogramArgs, {
    weights,
    bins: positions,
  }));

  if (prior.score <= 0) {
    throw new Error('ExpectedOutputsInPriceRangeToDerivePriceFromOutputs');
  }

  const atPrior = scoreAt({bin: prior.bin, weighting: weights});

  const strongest = max(...atPrior.strengths);

  // The measured spike strengths place the peak within the alignment
  const measured = atPrior.strengths.map(n => n / strongest);

  const within = range(prior.bin - kernelBins, prior.bin + kernelBins + 1);

  const best = bestPosition(assign({}, histogramArgs, {
    bins: within.filter(n => positions.includes(n)),
    weights: measured,
  }));

  const roughPrice = priceForDollarBin({
    bin: best.bin + best.delta,
    bins_per_decade: binsPerDecade,
  })
  .price;

  // Alias positions are where the pattern would also line up with itself
  const {shifts} = aliasShifts({amounts, bins_per_decade: binsPerDecade});

  // Only aliases at possible prices are candidates
  const possibleLow = floor(dollarBinForPrice({
    bins_per_decade: binsPerDecade,
    price: maxPossiblePrice,
  })
  .bin);

  const possibleHigh = ceil(dollarBinForPrice({
    bins_per_decade: binsPerDecade,
    price: minPossiblePrice,
  })
  .bin);

  const aliasBins = flatten(shifts.map(n => [best.bin - n, best.bin + n]))
    .filter(bin => bin >= possibleLow && bin <= possibleHigh);

  const atBest = scoreAt({bin: best.bin, weighting: weights});

  // An alias only competes when it shows a pattern of its own. Each position
  // is scored against the whole histogram through the amounts it can see
  // there, since both explain the same bins through different amounts
  const margins = aliasBins.map(bin => {
    const nearby = range(bin - aliasSearchBins, bin + aliasSearchBins + 1);

    // The best alias position is the first of the highest scores nearby
    const position = bestPosition(assign({}, histogramArgs, {
      weights,
      bins: nearby,
    }));

    const alias = scoreAt({bin: position.bin, weighting: weights});

    // Exit early when the alias shows no pattern or nothing above noise
    if (!alias.is_pattern || alias.score <= 0) {
      return Infinity;
    }

    return atBest.score / alias.score;
  });

  // Without an alias that competes the confidence is capped, not infinite, so
  // that it can be stored and logged as a number, and so is a larger margin
  const confidence = min(maxConfidence, ...margins);

  const peak = max(...atBest.strengths);

  const spikes = amounts.map((usd, index) => ({
    usd,
    strength: !peak ? Number() : atBest.strengths[index] / peak,
  }));

  // The excess at round USD positions compared to all excess in their span
  const centers = amounts.map(usd => {
    return best.bin + round(log10(usd) * binsPerDecade);
  });

  const atPositions = flatten(centers.map(center => {
    return range(center - kernelBins, center + kernelBins + 1);
  }));

  const span = range(
    max(Number(), min(...atPositions)),
    min(excess.length, max(...atPositions) + 1)
  );

  const excessAt = bins => bins.reduce((sum, n) => sum + (excess[n] || 0), 0);

  const spanExcess = excessAt(span);

  // Refine the price, recentering until it settles
  const refine = ({price, reach}) => refinePrice({
    amounts,
    price,
    reach,
    outputs: refining,
    weights: spikes.map(spike => spike.strength),
  });

  const refined = refine({price: roughPrice});

  // A peak at the edge of the refinement range is not a refinement
  const price = !refined.is_at_edge ? refined.price : roughPrice;

  const isCheckingStability = !args.is_quick && !refined.is_at_edge;

  // Perturbing the start and the reach of the refinement tests its stability
  const starts = !isCheckingStability ? [] : startShifts;
  const reaches = !isCheckingStability ? [] : [shortReach];

  const variants = []
    .concat(starts.map(shift => refine({price: roughPrice * shift})))
    .concat(reaches.map(reach => refine({reach, price: roughPrice})));

  const stability = variants.reduce((largest, variant) => {
    return max(largest, abs(log10(variant.price / price)));
  },
  Number());

  // A rival is the pattern fitting anywhere nearby, beyond the peak's spread
  const spreadBins = ceil(log10(1 + refined.spread) * binsPerDecade);

  const nearBins = max(minRivalBins, spreadBins + kernelBins);

  const rivalBins = range(best.bin - maxRivalBins, best.bin + maxRivalBins + 1)
    .filter(bin => abs(bin - best.bin) >= nearBins);

  const rival = rivalBins
    .map(bin => scoreAt({bin, weighting: measured}))
    .filter(position => !!position.is_pattern)
    .reduce((best, position) => max(best, position.score), Number());

  // The best position may be at the edge of the search window
  const fromHigh = highDollarBin - best.bin;
  const fromLow = best.bin - lowDollarBin;

  const {agreement} = templateAgreement({
    weights,
    strengths: atBest.strengths,
  });

  return {
    agreement,
    confidence,
    spikes,
    cents: round(price * centsPerDollar),
    coverage: !spanExcess ? 0 : excessAt(atPositions) / spanExcess,
    dispersion: refined.dispersion,
    evidence: atBest.evidence,
    is_at_edge: min(fromHigh, fromLow) < edgeBins,
    is_unsettled: refined.is_unsettled,
    noise: refined.noise,
    payments: !refined.is_at_edge ? refined.payments : Number(),
    rivalry: best.score <= 0 ? 0 : rival / best.score,
    rough_cents: round(roughPrice * centsPerDollar),
    significance: !refined.is_at_edge ? refined.significance : Number(),
    stability: !variants.length ? undefined : pow(10, stability) - 1,
  };
};
