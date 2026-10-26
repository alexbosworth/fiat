const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {timeOfDate} = require('./../../dates');

const at = iso => ({time: Date.parse(iso)});

test('An ISO 8601 date is read as a time', () => {
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

  Object.keys(dates).forEach(date => {
    deepEqual(timeOfDate({date}), at(dates[date]), `The time of ${date}`);
  });

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

  invalid.forEach(date => {
    deepEqual(timeOfDate({date}), {}, `${date} has no time`);
  });

  return;
});

test('A time without an offset is the same on every machine', () => {
  const {TZ} = process.env;

  try {
    process.env.TZ = 'America/Los_Angeles';

    deepEqual(
      timeOfDate({date: '2024-01-04T20:00:00'}),
      at('2024-01-04T20:00:00.000Z'),
      'A time without an offset is in UTC whatever the time zone'
    );
  } finally {
    if (TZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = TZ;
    }
  }

  return;
});
