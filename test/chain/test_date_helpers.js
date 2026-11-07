const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const addDays = require('./../../chain/add_days');
const {nearestEstimate} = require('./../../chain/estimates');
const {priceWindow} = require('./../../chain/estimates');
const {rememberEstimate} = require('./../../chain/estimates');
const {sampleHeights} = require('./../../chain/blocks');
const {windowHeights} = require('./../../chain/blocks');

const heightsFrom = (start, n) => [...Array(n).keys()].map(i => start + i);
const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);

// Known estimates of days
const known = {
  priors: {'2024-01-05': {cents: 2}},
  rates: {'2024-01-01': {cents: 1}},
};

// Lengths of days of blocks that are sampled
const lengths = [100, 137, 144, 150, 200, 233];

// Sample heights at doubling counts, checking each keeps the smaller samples
const doubledSamples = ({heights}) => {
  const sampled = count => sampleHeights({count, heights, initial: 12});

  // The first sample is centered on the range of blocks
  const first = sampled(12).heights.map(n => n - heights[0]);

  const center = sumOf(first) / first.length;

  const samples = [12, 24, 48, 96, 192].map(n => new Set(sampled(n).heights));

  return {
    is_centered: Math.abs(center - (heights.length - 1) / 2) <= 0.5,
    is_kept: samples.every((sample, i) => {
      return !i || [...samples[i - 1]].every(n => sample.has(n));
    }),
    sizes: samples.map(sample => sample.size),
  };
};

// The sizes of the windows that heights are split into
const windowSizes = args => ({
  sizes: windowHeights(args).windows.map(n => n.length),
});

const tests = [
  {
    args: {day: '2024-01-31', days: 1},
    description: 'A day is added to a day',
    expected: {day: '2024-02-01'},
    method: addDays,
  },
  {
    args: {day: '2024-01-01', days: -1},
    description: 'A day is taken away from a day',
    expected: {day: '2023-12-31'},
    method: addDays,
  },
  {
    args: {day: '2024-01-04', estimates: known},
    description: 'The nearest estimate is found across types',
    expected: {estimate: {cents: 2, day: '2024-01-05', distance: 1}},
    method: nearestEstimate,
  },
  {
    args: {day: '2024-01-03', estimates: known},
    description: 'A tie for the nearest estimate goes to the earlier day',
    expected: {estimate: {cents: 1, day: '2024-01-01', distance: 2}},
    method: nearestEstimate,
  },
  {
    args: {day: '2024-01-04', estimates: known, latest: '2024-01-03'},
    description: 'A latest day leaves out the estimates after it',
    expected: {estimate: {cents: 1, day: '2024-01-01', distance: 3}},
    method: nearestEstimate,
  },
  {
    args: {day: '2024-01-03', estimates: {}},
    description: 'No estimates gives no nearest estimate',
    expected: {estimate: undefined},
    method: nearestEstimate,
  },
  {
    args: {cents: 10000},
    description: 'A price window surrounds a known price, too narrow to alias',
    expected: {max_price: 120, min_price: 62},
    method: priceWindow,
  },
  {
    args: {
      estimate: {
        block_id: '00',
        blocks: [1, 2],
        cents: 2,
        date: '2024-01-02',
        is_sample: true,
        version: '2.x',
      },
      estimates: {priors: {}, provisional: {}, rates: {}},
    },
    description: 'A sample estimate is remembered as a prior',
    expected: {
      estimates: {
        priors: {
          '2024-01-02': {
            block_id: '00',
            blocks: [1, 2],
            cents: 2,
            version: '2.x',
          },
        },
        provisional: {},
        rates: {},
      },
    },
    method: rememberEstimate,
  },
  {
    args: {
      estimate: {
        block_id: '02',
        blocks: [5, 6],
        cents: 3,
        date: '2024-01-03',
        is_provisional: true,
        version: '2.x',
      },
      estimates: {priors: {}, provisional: {}, rates: {}},
    },
    description: 'A provisional estimate is remembered apart',
    expected: {
      estimates: {
        priors: {},
        provisional: {
          '2024-01-03': {
            block_id: '02',
            blocks: [5, 6],
            cents: 3,
            version: '2.x',
          },
        },
        rates: {},
      },
    },
    method: rememberEstimate,
  },
  {
    args: {
      estimate: {
        agreement: 0.87654,
        block_id: '01',
        blocks: [3, 4],
        cents: 4,
        confidence: 1.23456,
        date: '2024-01-01',
        dispersion: 0.0251,
        drift: 0.0012,
        evidence: 0.98765,
        outputs: 5,
        payments: 6,
        rivalry: 0.12345,
        round_shift: 0.0005,
        stability: 0.0001,
        version: '2.x',
      },
      estimates: {
        priors: {'2024-01-01': {cents: 1}},
        provisional: {},
        rates: {},
      },
    },
    description: 'A full day estimate is remembered as a rate, rounded',
    expected: {
      estimates: {
        priors: {},
        provisional: {},
        rates: {
          '2024-01-01': {
            agreement: 0.877,
            block_id: '01',
            blocks: [3, 4],
            cents: 4,
            confidence: 1.235,
            dispersion: 0.025,
            drift: 0.001,
            evidence: 0.988,
            is_unguided: undefined,
            is_unsettled: undefined,
            outputs: 5,
            payments: 6,
            rivalry: 0.123,
            round_shift: 0.001,
            stability: 0,
            version: '2.x',
          },
        },
      },
    },
    method: rememberEstimate,
  },
  {
    args: {count: 3, heights: [1, 2]},
    description: 'A sample of more heights than there are is all of them',
    expected: {heights: [1, 2]},
    method: sampleHeights,
  },
  {
    args: {count: 3, heights: [1, 2, 3, 4, 5, 6]},
    description: 'The middle of each stretch of heights is sampled',
    expected: {heights: [2, 4, 6]},
    method: sampleHeights,
  },
  {
    args: {count: 2, heights: [1, 2, 3, 4, 5, 6, 7]},
    description: 'A sample of heights is centered on the range',
    expected: {heights: [2, 6]},
    method: sampleHeights,
  },
  {
    args: {count: 4, heights: [1, 2, 3, 4, 5, 6, 7, 8], initial: 2},
    description: 'A doubled sample starts each stretch',
    expected: {heights: [1, 3, 5, 7]},
    method: sampleHeights,
  },
  {
    args: {count: 3, heights: []},
    description: 'No heights are split into no windows',
    expected: {windows: []},
    method: windowHeights,
  },
  {
    args: {count: 3, heights: heightsFrom(100, 2)},
    description: 'Fewer heights than a window are a window',
    expected: {sizes: [2]},
    method: windowSizes,
  },
  {
    args: {count: 3, heights: heightsFrom(100, 6)},
    description: 'Heights are split into windows of a count',
    expected: {sizes: [3, 3]},
    method: windowSizes,
  },
  {
    args: {count: 4, heights: heightsFrom(100, 9)},
    description: 'A short last window is joined to the one before it',
    expected: {sizes: [4, 5]},
    method: windowSizes,
  },
  {
    args: {count: 4, heights: heightsFrom(100, 10)},
    description: 'A last window of at least half a window stands on its own',
    expected: {sizes: [4, 4, 2]},
    method: windowSizes,
  },
  {
    args: {count: 3, heights: heightsFrom(100, 7)},
    description: 'Windows hold consecutive heights in order',
    expected: {windows: [[100, 101, 102], [103, 104, 105, 106]]},
    method: windowHeights,
  },
].concat(lengths.map(length => ({
  args: {heights: heightsFrom(800000, length)},
  description: `A doubled sample of ${length} blocks keeps smaller samples`,
  expected: {
    is_centered: true,
    is_kept: true,
    sizes: [12, 24, 48, 96, 192].map(n => Math.min(n, length)),
  },
  method: doubledSamples,
})));

tests.forEach(({args, description, expected, method}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected result');

    return;
  });
});
