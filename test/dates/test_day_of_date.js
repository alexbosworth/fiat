const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {dayOfDate} = require('./../../dates');

// Dates and their days in UTC
const days = {
  '2024-01-01': '2024-01-01',
  '2024-01-01T10:00:00.000Z': '2024-01-01',
  '2024-01-01T00:30:00+02:00': '2023-12-31',
  '2024-01-01T23:30:00-07:00': '2024-01-02',
  '2024-01-04T20:00:00': '2024-01-04',
  '2024-02-29': '2024-02-29',
};

// Values that are not dates of days
const invalid = [
  undefined,
  '',
  'yesterday',
  '2024-1-1',
  '2024-01-01not-a-date',
  '2024-01-01T25:00:00Z',
  '2023-02-29',
  '2024-02-30',
  '2024-13-01',
];

const tests = [].concat(
  Object.keys(days).map(date => ({
    args: {date},
    description: `The day of ${date} is its day in UTC`,
    expected: {day: days[date]},
  })),
  invalid.map(date => ({
    args: {date},
    description: `${date} has no day`,
    expected: {},
  }))
);

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(dayOfDate(args), expected, 'Got expected day');

    return;
  });
});
