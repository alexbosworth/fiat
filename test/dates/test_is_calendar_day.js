const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {isCalendarDay} = require('./../../dates');

test('A day of the calendar is written as YYYY-MM-DD', () => {
  const days = {
    '2024-02-29': true,
    '2024-12-31': true,
    '2023-02-29': false,
    '2024-02-30': false,
    '2024-1-1': false,
    '2024-01-01T00:00:00Z': false,
    'yesterday': false,
  };

  Object.keys(days).forEach(day => {
    const expected = {is_calendar_day: days[day]};

    deepEqual(isCalendarDay({day}), expected, `${day} is checked`);
  });

  deepEqual(isCalendarDay({}), {is_calendar_day: false}, 'A day is needed');

  return;
});
