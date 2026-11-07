const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {aliasShifts} = require('./../../chain/outputs');
const {histogramPeak} = require('./../../chain/histogram');
const {impliedPricesHistogram} = require('./../../chain/histogram');
const {kernelWidth} = require('./../../chain/histogram');
const {noiseStrength} = require('./../../chain/histogram');
const {noiseStrengths} = require('./../../chain/histogram');
const {peakWidth} = require('./../../chain/histogram');
const {roundAmounts} = require('./../../chain/outputs');
const {scorePosition} = require('./../../chain/histogram');
const {smoothBins} = require('./../../chain/histogram');
const {spikeStrengths} = require('./../../chain/histogram');
const {templateAgreement} = require('./../../chain/histogram');

const flatExcess = Array(400).fill(0);
const rounded = n => Math.round(n * 1e9) / 1e9;
const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);

const noisy = [...Array(60).keys()].map(n => (n * 7919 % 13) / 100);
const {noise} = noiseStrengths({excess: flatExcess, min_bin: 0});

// Spikes among the neighbors are the highest fifth and are left out
const spiky = Array(30).fill(0.01).map((n, i) => i % 5 ? n : 1);

// A fine histogram with a peak on a flat background
const peaked = Array(75).fill(10).map((n, i) => {
  return n + ([5, 20, 50, 20, 5][i - 35] || 0);
});

// The peak of a fine histogram, and whether it is significant and smoothed
const peakOf = args => {
  const res = histogramPeak(args);

  return {
    delta: res.delta,
    is_significant: res.significance > 5,
    is_smoothed: res.width > 1 && res.width < 20,
    payments: res.payments,
    peak: res.peak,
  };
};

// The span of implied prices, and the counts around the center bin
const impliedOf = args => {
  const {counts, weighted} = impliedPricesHistogram(args);

  return {
    center: counts[args.reach],
    center_weight: weighted[args.reach],
    length: counts.length,
    over: counts[args.reach - 4],
    total: sumOf(counts),
  };
};

// The round amounts, and how their weights fall away from a hundred dollars
const roundOf = args => {
  const {amounts, weights} = roundAmounts(args);

  const weightOf = usd => weights[amounts.indexOf(usd)];

  return {
    digits: amounts.slice(0, 9),
    is_falling_above: weightOf(1000) < weightOf(100),
    is_falling_below: weightOf(10) < weightOf(100),
    is_falling_from_ten: weightOf(20) < weightOf(10),
    is_falling_from_twenty: weightOf(40) < weightOf(20),
    is_sorted: amounts.every((n, i) => !i || n > amounts[i - 1]),
    is_weighted: amounts.length === weights.length,
    last: amounts[amounts.length - 1],
    weight_at_center: weightOf(100),
  };
};

const makeScoreArgs = overrides => {
  const args = {
    noise,
    amounts: [1, 2, 5],
    bins_per_decade: 200,
    dollar_bin: 100,
    min_bin: 0,
    strengths: spikeStrengths({excess: flatExcess}).strengths,
    weights: [1, 1, 1],
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: {amounts: [1, 2, 5, 10], bins_per_decade: 200},
    description: 'Alias shifts are the ratios between round amounts',
    expected: {shifts: [60, 80, 140, 200]},
    method: aliasShifts,
  },
  {
    args: {excess: noisy, min_bin: 5},
    description: 'Noise is measured once for every bin of a histogram',
    expected: {
      noise: noisy.map((n, center) => {
        return noiseStrength({center, excess: noisy, min_bin: 5}).noise;
      }),
    },
    method: noiseStrengths,
  },
  {
    args: {excess: spiky, min_bin: 0},
    description: 'Spikes among the neighbors of a bin are not noise',
    expected: {noise: 0.03},
    method: args => ({noise: rounded(noiseStrengths(args).noise[15])}),
  },
  {
    args: makeScoreArgs({noise: undefined}),
    description: 'The noise of the bins is required to score a position',
    error: 'ExpectedNoiseStrengthsToScorePosition',
    method: scorePosition,
  },
  {
    args: makeScoreArgs({strengths: undefined}),
    description: 'The spike strengths are required to score a position',
    error: 'ExpectedSpikeStrengthsToScorePosition',
    method: scorePosition,
  },
  {
    args: makeScoreArgs({noise: noise.slice(1)}),
    description: 'Every bin needs its noise to score a position',
    error: 'ExpectedNoiseStrengthOfEveryBinToScorePosition',
    method: scorePosition,
  },
  {
    args: makeScoreArgs({}),
    description: 'A histogram without spikes scores nothing and is no pattern',
    expected: {
      evidence: 1,
      is_pattern: false,
      observable: [true, true, true],
      score: 0,
      strengths: [0, 0, 0],
    },
    method: scorePosition,
  },
  {
    args: {},
    description: 'Round amounts are generated with prior weights',
    expected: {
      digits: [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5],
      is_falling_above: true,
      is_falling_below: true,
      is_falling_from_ten: true,
      is_falling_from_twenty: true,
      is_sorted: true,
      is_weighted: true,
      last: 100000,
      weight_at_center: 1,
    },
    method: roundOf,
  },
  {
    args: {bins: [0, 0, 1, 0, 0], half: 1},
    description: 'A lone spike is smoothed out to its neighbors',
    expected: {smoothed: [0, 0.5, 1, 0.5, 0]},
    method: smoothBins,
  },
  {
    args: {bins: [1, 0, 0], half: 1},
    description: 'Smoothing treats the edge as empty',
    expected: {smoothed: [1, 0.5, 0]},
    method: smoothBins,
  },
  {
    args: {half: 8},
    description: 'The default smoothing kernel widens a spike to nine bins',
    expected: {width: 9},
    method: kernelWidth,
  },
  {
    args: {half: 12},
    description: 'The widest smoothing kernel widens a spike to thirteen bins',
    expected: {width: 13},
    method: kernelWidth,
  },
  {
    args: {half: 0},
    description: 'No smoothing keeps a spike to its bin',
    expected: {width: 1},
    method: kernelWidth,
  },
  {
    args: {bins: [0, 1, 4, 3, 1, 0], peak: 2},
    description: 'The width of a peak is measured at half height',
    expected: {width: 2},
    method: peakWidth,
  },
  {
    args: {bins: [4, 3, 1], peak: 0},
    description: 'The width of a peak at the start is measured',
    expected: {width: 2},
    method: peakWidth,
  },
  {
    args: {bins: [1, 3, 4], peak: 2},
    description: 'The width of a peak at the end is measured',
    expected: {width: 2},
    method: peakWidth,
  },
  {
    args: {bins: [0, 0, 0], peak: 1},
    description: 'There is no width without a peak',
    expected: {width: 0},
    method: peakWidth,
  },
  {
    args: {strengths: [1, 2], weights: [2, 4]},
    description: 'Strengths in the shape of the weights agree',
    expected: {agreement: 1},
    method: args => ({agreement: rounded(templateAgreement(args).agreement)}),
  },
  {
    args: {strengths: [1, 0], weights: [0, 1]},
    description: 'Strengths in another shape than the weights do not agree',
    expected: {agreement: 0},
    method: templateAgreement,
  },
  {
    args: {strengths: [0, 0], weights: [1, 1]},
    description: 'No strengths give no agreement',
    expected: {agreement: 0},
    method: templateAgreement,
  },
  {
    args: {
      amounts: [10, 100],
      bins_per_decade: 1000,
      outputs: [100000, 100000, 101000, 10000, 1000000, 5000000],
      price: 100000,
      reach: 37,
      weights: [0.5, 1],
    },
    description: 'Implied prices near round amounts are counted in fine bins',
    expected: {
      center: 3,
      center_weight: 2.5,
      length: 75,
      over: 1,
      total: 4,
    },
    method: impliedOf,
  },
  {
    args: {counts: peaked, exclude: 12, kernel: 8, weighted: peaked},
    description: 'The peak of a fine histogram is found above the background',
    expected: {
      delta: 0,
      is_significant: true,
      is_smoothed: true,
      payments: 100,
      peak: 37,
    },
    method: peakOf,
  },
  {
    args: {
      counts: Array(75).fill(10),
      exclude: 12,
      kernel: 8,
      weighted: Array(75).fill(10),
    },
    description: 'A flat fine histogram has no peak',
    expected: {
      delta: 0,
      noise: 0,
      payments: 0,
      peak: 0,
      significance: 0,
      width: 0,
    },
    method: histogramPeak,
  },
];

tests.forEach(({args, description, error, expected, method}) => {
  return test(description, () => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected result');
    }

    return;
  });
});
