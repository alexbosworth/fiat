const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../scripts/differences_summary');

const tests = [
  {
    args: {differences: []},
    description: 'No differences give an empty summary',
    expected: {changed: 0, count: 0, description: 'no days', largest: []},
  },
  {
    args: {
      differences: [
        {day: '2024-01-01', difference: 0.001},
        {day: '2024-01-02', difference: -0.03},
        {day: '2024-01-03', difference: 0},
        {day: '2024-01-04', difference: 0.002},
      ],
    },
    description: 'Differences are summarized by their sizes and signs',
    expected: {
      bias: 0.0005,
      changed: 3,
      count: 4,
      description: [
        'median 0.15%, 95% within 3.00%, bias +0.05%,',
        'largest 2024-01-02 -3.00%, 2024-01-04 +0.20%, 2024-01-01 +0.10%',
      ].join(' '),
      largest: [
        {day: '2024-01-02', difference: -0.03},
        {day: '2024-01-04', difference: 0.002},
        {day: '2024-01-01', difference: 0.001},
      ],
      median: 0.0015,
      percentile: 0.03,
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected summary');

    return;
  });
});
