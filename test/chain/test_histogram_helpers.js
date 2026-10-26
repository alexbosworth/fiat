const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
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

test('Alias shifts are the ratios between round amounts', () => {
  const {shifts} = aliasShifts({amounts: [1, 2, 5, 10], bins_per_decade: 200});

  // Ratios of 2, 2.5, 5 and 10 in bins of a two hundredth of a decade
  deepEqual(shifts, [60, 80, 140, 200], 'Got distinct alias shifts');

  return;
});

test('Noise is measured once for every bin of a histogram', () => {
  const excess = [...Array(60).keys()].map(n => (n * 7919 % 13) / 100);

  const {noise} = noiseStrengths({excess, min_bin: 5});

  deepEqual(noise.length, excess.length, 'Every bin has a noise strength');

  noise.forEach((strength, center) => {
    const expected = noiseStrength({center, excess, min_bin: 5}).noise;

    deepEqual(strength, expected, 'Noise is the noise at the bin');

    return;
  });

  // Spikes among the neighbors are the highest fifth and are left out
  const spiky = Array(30).fill(0.01).map((n, i) => i % 5 ? n : 1);

  const spikyNoise = noiseStrengths({excess: spiky, min_bin: 0}).noise;

  ok(Math.abs(spikyNoise[15] - 0.03) < 1e-9, 'Other spikes are not noise');

  return;
});

test('A position is scored above the noise of its bins', () => {
  const excess = Array(400).fill(0);

  const args = {
    amounts: [1, 2, 5],
    bins_per_decade: 200,
    dollar_bin: 100,
    min_bin: 0,
    strengths: spikeStrengths({excess}).strengths,
    weights: [1, 1, 1],
  };

  throws(
    () => scorePosition(args),
    new Error('ExpectedNoiseStrengthsToScorePosition'),
    'The noise of the bins is required'
  );

  const {noise} = noiseStrengths({excess, min_bin: 0});

  throws(
    () => scorePosition(Object.assign({noise}, args, {strengths: undefined})),
    new Error('ExpectedSpikeStrengthsToScorePosition'),
    'The spike strengths of the bins are required'
  );

  throws(
    () => scorePosition(Object.assign({noise: noise.slice(1)}, args)),
    new Error('ExpectedNoiseStrengthOfEveryBinToScorePosition'),
    'Every bin needs its noise'
  );

  const scored = scorePosition(Object.assign({noise}, args));

  deepEqual(scored.score, 0, 'A histogram without spikes scores nothing');
  deepEqual(scored.is_pattern, false, 'And shows no pattern');

  return;
});

test('Round amounts are generated with prior weights', () => {
  const {amounts, weights} = roundAmounts({});

  deepEqual(amounts.length, weights.length, 'Every amount has a weight');
  deepEqual(amounts.slice(0, 9), [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5], 'Digits');
  deepEqual(amounts[amounts.length - 1], 100000, 'Amounts stop at the max');
  deepEqual(amounts.slice().sort((a, b) => a - b), amounts, 'Sorted');

  const weightOf = usd => weights[amounts.indexOf(usd)];

  deepEqual(weightOf(100), 1, 'The envelope is centered on a hundred dollars');
  ok(weightOf(10) < weightOf(100), 'Envelope falls below the center');
  ok(weightOf(1000) < weightOf(100), 'Envelope falls above the center');
  ok(weightOf(40) < weightOf(20) && weightOf(20) < weightOf(10), 'Digits');

  return;
});

test('Bins are smoothed with a triangular kernel', () => {
  deepEqual(
    smoothBins({bins: [0, 0, 1, 0, 0], half: 1}),
    {smoothed: [0, 0.5, 1, 0.5, 0]},
    'A lone spike is spread to its neighbors'
  );

  deepEqual(
    smoothBins({bins: [1, 0, 0], half: 1}),
    {smoothed: [1, 0.5, 0]},
    'The edge is treated as empty'
  );

  return;
});

test('The width that smoothing alone gives a spike is measured', () => {
  // A kernel with weights falling to zero at nine bins is at half at four
  deepEqual(kernelWidth({half: 8}).width, 9, 'Default kernel widens to nine');
  deepEqual(kernelWidth({half: 12}).width, 13, 'Widest kernel is thirteen');
  deepEqual(kernelWidth({half: 0}).width, 1, 'No smoothing keeps the spike');

  return;
});

test('The width of a peak is measured at half height', () => {
  deepEqual(peakWidth({bins: [0, 1, 4, 3, 1, 0], peak: 2}), {width: 2});
  deepEqual(peakWidth({bins: [4, 3, 1], peak: 0}), {width: 2}, 'At the start');
  deepEqual(peakWidth({bins: [1, 3, 4], peak: 2}), {width: 2}, 'At the end');
  deepEqual(peakWidth({bins: [0, 0, 0], peak: 1}), {width: 0}, 'No peak');

  return;
});

test('Agreement is the cosine similarity of strengths and weights', () => {
  const same = templateAgreement({strengths: [1, 2], weights: [2, 4]});

  deepEqual(same.agreement.toFixed(6), '1.000000', 'Same shape agrees');
  const across = templateAgreement({strengths: [1, 0], weights: [0, 1]});
  const empty = templateAgreement({strengths: [0, 0], weights: [1, 1]});

  deepEqual(across.agreement, 0, 'Different shapes do not agree');
  deepEqual(empty.agreement, 0, 'No strengths gives no agreement');

  return;
});

test('Implied prices near round amounts are counted into fine bins', () => {
  const {counts, weighted} = impliedPricesHistogram({
    amounts: [10, 100],
    bins_per_decade: 1000,
    outputs: [100000, 100000, 101000, 10000, 1000000, 5000000],
    price: 100000,
    reach: 37,
    weights: [0.5, 1],
  });

  deepEqual(counts.length, 75, 'The histogram spans the reach on both sides');
  deepEqual(counts[37], 3, 'Exact round payments land in the center bin');
  deepEqual(weighted[37], 2.5, 'Weights are summed by the round amount');
  deepEqual(counts[37 - 4], 1, 'A payment slightly over implies lower price');
  deepEqual(counts.reduce((sum, n) => sum + n, 0), 4, 'Far outputs skipped');

  return;
});

test('The peak of a fine histogram is found above the background', () => {
  const counts = Array(75).fill(10);

  [5, 20, 50, 20, 5].forEach((count, i) => counts[35 + i] += count);

  const res = histogramPeak({
    counts,
    exclude: 12,
    kernel: 8,
    weighted: counts,
  });

  deepEqual(res.peak, 37, 'The peak bin is found');
  deepEqual(res.delta, 0, 'A symmetric peak is centered on its bin');
  deepEqual(res.payments, 100, 'Payments above the background are counted');
  ok(res.significance > 5, 'The peak is significant');
  ok(res.width > 1 && res.width < 20, 'The width of the smoothed peak');

  const flat = histogramPeak({
    counts: Array(75).fill(10),
    exclude: 12,
    kernel: 8,
    weighted: Array(75).fill(10),
  });

  deepEqual(flat.payments, 0, 'A flat histogram has no payments');
  deepEqual(flat.significance, 0, 'A flat histogram has no significance');

  return;
});
