const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {kernelBins} = require('./../../chain/constants');
const method = require('./../../chain/histogram/position_score');
const {noiseStrengths} = require('./../../chain/histogram');
const {spikeKernel} = require('./../../chain/constants');
const {spikeStrengths} = require('./../../chain/histogram');

const amounts = [1, 2, 5, 10, 20, 50, 100];
const binsPerDecade = 200;
const half = (spikeKernel.length - 1) / 2;
const {log10} = Math;
const minBin = 20;
const {round} = Math;
const weights = [0.5, 0.6, 0.9, 1, 0.8, 0.7, 0.4];

const shifts = amounts.map(usd => round(log10(usd) * binsPerDecade));

// A background with spikes where the amounts land when a dollar is at bin 100
const excess = [...Array(800).keys()].map(n => {
  return n * 7919 % 13 / 1000 + (shifts.includes(n - 100) ? 0.05 : 0);
});

const {noise} = noiseStrengths({excess, min_bin: minBin});
const {strengths} = spikeStrengths({excess});

// Positions across the histogram and past both of its ends
const bins = [...Array(900).keys()].map(n => n - 50);

// The score of a position from its whole spikes above their noise
const scoreAt = bin => shifts.reduce((sum, shift, i) => {
  const center = bin + shift;

  const isHigh = center + kernelBins >= excess.length;
  const isLow = center - kernelBins < minBin;

  // The spike is the excess around its center, weighted by the kernel
  const spike = spikeKernel.reduce((total, weight, offset) => {
    return total + weight * (excess[center + offset - half] || 0);
  },
  0);

  // A spike counts when all of it is within the histogram
  const above = isHigh || isLow ? 0 : spike - noise[center];

  return sum + above * weights[i];
},
0);

// Score the positions of a dollar at bins
const scoresAt = args => ({
  scores: args.bins.map(bin => {
    return method({
      noise,
      shifts,
      strengths,
      weights,
      dollar_bin: bin,
      min_bin: minBin,
    })
    .score;
  }),
});

const tests = [
  {
    args: {bins},
    description: 'A position is scored by its whole spikes above their noise',
    expected: {scores: bins.map(scoreAt)},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(scoresAt(args), expected, 'Got expected scores');

    return;
  });
});
