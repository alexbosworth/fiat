const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../scripts/differences_summary');

test('No differences give an empty summary', () => {
  deepEqual(
    method({differences: []}),
    {changed: 0, count: 0, description: 'no days', largest: []},
    'Nothing to summarize'
  );

  return;
});

test('Differences are summarized by their sizes and signs', () => {
  const res = method({
    differences: [
      {day: '2024-01-01', difference: 0.001},
      {day: '2024-01-02', difference: -0.03},
      {day: '2024-01-03', difference: 0},
      {day: '2024-01-04', difference: 0.002},
    ],
  });

  deepEqual(res.count, 4, 'Every day is counted');
  deepEqual(res.changed, 3, 'Days with a difference are counted');
  deepEqual(res.median, 0.0015, 'The median is of the sizes');
  deepEqual(res.percentile, 0.03, 'The 95th percentile is of the sizes');
  deepEqual(res.bias, 0.0005, 'The bias keeps the signs');

  deepEqual(
    res.largest.map(n => n.day),
    ['2024-01-02', '2024-01-04', '2024-01-01'],
    'The largest are listed first, without the day that did not differ'
  );

  deepEqual(
    res.description,
    'median 0.15%, 95% within 3.00%, bias +0.05%, ' +
    'largest 2024-01-02 -3.00%, 2024-01-04 +0.20%, 2024-01-01 +0.10%',
    'The summary is described'
  );

  return;
});
