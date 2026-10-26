const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');

const addDays = require('./../../chain/add_days');
const {nearestEstimate} = require('./../../chain/estimates');
const {priceWindow} = require('./../../chain/estimates');
const {rememberEstimate} = require('./../../chain/estimates');
const {sampleHeights} = require('./../../chain/blocks');
const {windowHeights} = require('./../../chain/blocks');

test('Days are added to a day', () => {
  deepEqual(addDays({day: '2024-01-31', days: 1}), {day: '2024-02-01'});
  deepEqual(addDays({day: '2024-01-01', days: -1}), {day: '2023-12-31'});

  return;
});

test('The nearest estimate is found', () => {
  const estimates = {
    priors: {'2024-01-05': {cents: 2}},
    rates: {'2024-01-01': {cents: 1}},
  };

  deepEqual(
    nearestEstimate({estimates, day: '2024-01-04'}),
    {estimate: {cents: 2, day: '2024-01-05', distance: 1}},
    'Closest estimate is found across types'
  );

  deepEqual(
    nearestEstimate({estimates, day: '2024-01-03'}),
    {estimate: {cents: 1, day: '2024-01-01', distance: 2}},
    'Ties go to the earlier day'
  );

  deepEqual(
    nearestEstimate({estimates, day: '2024-01-04', latest: '2024-01-03'}),
    {estimate: {cents: 1, day: '2024-01-01', distance: 3}},
    'A latest day leaves out the estimates after it'
  );

  deepEqual(
    nearestEstimate({day: '2024-01-03', estimates: {}}),
    {estimate: undefined},
    'No estimates gives no nearest estimate'
  );

  return;
});

test('A price window surrounds a known price', () => {
  const bounds = priceWindow({cents: 10000});

  deepEqual(bounds, {max_price: 120, min_price: 62});

  deepEqual(bounds.max_price / bounds.min_price < 2, true, 'No alias fits');

  return;
});

test('Estimates are remembered by type', () => {
  const estimates = {
    priors: {'2024-01-01': {cents: 1}},
    provisional: {},
    rates: {},
  };

  rememberEstimate({
    estimates,
    estimate: {
      blocks: [1, 2],
      cents: 2,
      date: '2024-01-02',
      hash: '00',
      is_sample: true,
      version: '2.x',
    },
  });

  rememberEstimate({
    estimates,
    estimate: {
      blocks: [5, 6],
      cents: 3,
      date: '2024-01-03',
      hash: '02',
      is_provisional: true,
      version: '2.x',
    },
  });

  rememberEstimate({
    estimates,
    estimate: {
      agreement: 0.87654,
      blocks: [3, 4],
      cents: 4,
      confidence: 1.23456,
      date: '2024-01-01',
      hash: '01',
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
  });

  deepEqual(estimates, {
    priors: {
      '2024-01-02': {blocks: [1, 2], cents: 2, hash: '00', version: '2.x'},
    },
    provisional: {
      '2024-01-03': {blocks: [5, 6], cents: 3, hash: '02', version: '2.x'},
    },
    rates: {
      '2024-01-01': {
        agreement: 0.877,
        blocks: [3, 4],
        cents: 4,
        confidence: 1.235,
        hash: '01',
        is_unguided: undefined,
        is_unsettled: undefined,
        dispersion: 0.025,
        drift: 0.001,
        evidence: 0.988,
        outputs: 5,
        payments: 6,
        rivalry: 0.123,
        round_shift: 0.001,
        stability: 0,
        version: '2.x',
      },
    },
  });

  return;
});

test('Heights are sampled evenly', () => {
  deepEqual(sampleHeights({count: 3, heights: [1, 2]}), {heights: [1, 2]});

  deepEqual(
    sampleHeights({count: 3, heights: [1, 2, 3, 4, 5, 6]}),
    {heights: [2, 4, 6]},
    'The middle of each stretch is picked'
  );

  deepEqual(
    sampleHeights({count: 2, heights: [1, 2, 3, 4, 5, 6, 7]}),
    {heights: [2, 6]},
    'A sample is centered on the range'
  );

  deepEqual(
    sampleHeights({count: 4, heights: [1, 2, 3, 4, 5, 6, 7, 8], initial: 2}),
    {heights: [1, 3, 5, 7]},
    'A doubled sample starts each stretch'
  );

  return;
});

test('A doubled sample keeps the blocks of the smaller samples', () => {
  [100, 137, 144, 150, 200, 233].forEach(length => {
    const heights = [...Array(length).keys()].map(n => 800000 + n);

    const sampled = count => sampleHeights({count, heights, initial: 12});

    // The first sample is centered on the range of blocks
    const first = sampled(12).heights.map(n => n - heights[0]);

    const center = first.reduce((sum, n) => sum + n, 0) / first.length;

    ok(Math.abs(center - (length - 1) / 2) <= 0.5, 'First sample centered');

    [12, 24, 48, 96, 192].reduce((smaller, count) => {
      const sample = new Set(sampled(count).heights);

      ok([...smaller].every(n => sample.has(n)), 'Smaller sample is kept');
      deepEqual(sample.size, Math.min(count, length), 'Heights are distinct');

      return sample;
    },
    new Set());

    return;
  });

  return;
});

test('Heights are split into consecutive windows', () => {
  const heights = n => [...Array(n).keys()].map(i => 100 + i);
  const sizes = res => res.windows.map(n => n.length);

  deepEqual(windowHeights({count: 3, heights: []}), {windows: []});
  deepEqual(sizes(windowHeights({count: 3, heights: heights(2)})), [2]);
  deepEqual(sizes(windowHeights({count: 3, heights: heights(6)})), [3, 3]);

  // A short last window is joined to the one before it
  deepEqual(sizes(windowHeights({count: 4, heights: heights(9)})), [4, 5]);

  // A last window of at least half a window stands on its own
  deepEqual(sizes(windowHeights({count: 4, heights: heights(10)})), [4, 4, 2]);

  deepEqual(
    windowHeights({count: 3, heights: heights(7)}),
    {windows: [[100, 101, 102], [103, 104, 105, 106]]},
    'Windows hold consecutive heights in order'
  );

  return;
});
