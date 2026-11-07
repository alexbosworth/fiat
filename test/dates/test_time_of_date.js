const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {timeOfDate} = require('./../../dates');

const at = iso => ({time: Date.parse(iso)});

// Dates are read on a machine that is not in UTC, a time is the same anyway
process.env.TZ = 'America/Los_Angeles';

// Dates and the times they are read as
const dates = {
  '2024-01-04': '2024-01-04T00:00:00.000Z',
  '2024-01-04T20:00': '2024-01-04T20:00:00.000Z',
  '2024-01-04T20:00:00': '2024-01-04T20:00:00.000Z',
  '2024-01-04T20:00:00.5Z': '2024-01-04T20:00:00.500Z',
  '2024-01-04 20:00:00.123456': '2024-01-04T20:00:00.123Z',
  '2024-01-04t20:00:00z': '2024-01-04T20:00:00.000Z',
  '2024-01-04T20:00:00-08:00': '2024-01-05T04:00:00.000Z',
  '2024-01-04T20:00:00+0530': '2024-01-04T14:30:00.000Z',
  '2024-02-29T23:59:59.999Z': '2024-02-29T23:59:59.999Z',
};

// Values that are not ISO 8601 dates
const invalid = [
  undefined,
  '',
  'yesterday',
  '20240104',
  ' 2024-01-04',
  '2024-1-4',
  '2024-01-04not-a-date',
  '2024-01-04T',
  '2024-01-04T20',
  '2024-01-04T24:00',
  '2024-01-04T24:00:00Z',
  '2024-01-04T25:00',
  '2024-01-04T20:60',
  '2024-01-04T20:00:00+05',
  '2024-01-04T20:00:00+25:00',
  '2024-01-04T20:00:00 GMT',
  '2023-02-29',
  '2024-02-30',
  '2024-13-01',
];

const tests = [].concat(
  Object.keys(dates).map(date => ({
    args: {date},
    description: `The time of ${date} is read`,
    expected: at(dates[date]),
  })),
  invalid.map(date => ({
    args: {date},
    description: `${date} has no time`,
    expected: {},
  })),
  [{
    args: {date: '2024-01-04T20:00:00'},
    description: 'A time without an offset is in UTC whatever the time zone',
    expected: at('2024-01-04T20:00:00.000Z'),
  }]
);

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(timeOfDate(args), expected, 'Got expected time');

    return;
  });
});
