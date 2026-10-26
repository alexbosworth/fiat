const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {dayOfDate} = require('./../../dates');

test('The day of a date is its day in UTC', () => {
  const days = {
    '2024-01-01': '2024-01-01',
    '2024-01-01T10:00:00.000Z': '2024-01-01',
    '2024-01-01T00:30:00+02:00': '2023-12-31',
    '2024-01-01T23:30:00-07:00': '2024-01-02',
    '2024-01-04T20:00:00': '2024-01-04',
    '2024-02-29': '2024-02-29',
  };

  Object.keys(days).forEach(date => {
    deepEqual(dayOfDate({date}), {day: days[date]}, `The day of ${date}`);
  });

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

  invalid.forEach(date => {
    deepEqual(dayOfDate({date}), {}, `${date} has no day`);
  });

  return;
});
