const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {isCalendarDay} = require('./../../dates');

// Days and whether they are days of the calendar written as YYYY-MM-DD
const days = {
  '2024-02-29': true,
  '2024-12-31': true,
  '2023-02-29': false,
  '2024-02-30': false,
  '2024-1-1': false,
  '2024-01-01T00:00:00Z': false,
  'yesterday': false,
};

const tests = [].concat(
  Object.keys(days).map(day => ({
    args: {day},
    description: `${day} is checked as a day of the calendar`,
    expected: {is_calendar_day: days[day]},
  })),
  [{
    args: {},
    description: 'A day is needed',
    expected: {is_calendar_day: false},
  }]
);

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(isCalendarDay(args), expected, 'Got expected result');

    return;
  });
});
