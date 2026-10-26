const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const addDays = require('./../../chain/add_days');
const {earliestSupportedDay} = require('./../../chain/known');
const method = require('./../../scripts/check_known_prices');
const {methodVersion} = require('./../../chain/known');

const {day: earliest} = earliestSupportedDay({});
const {fromEntries} = Object;
const {version} = methodVersion({});

// The time at noon on a day
const noon = day => Date.parse(`${day}T12:00:00.000Z`);

// Known prices JSON with a price of a cent on each of the days
const makeText = ({days, version}) => {
  return JSON.stringify({version, prices: fromEntries(days.map(n => [n, 1]))});
};

const later = addDays({day: earliest, days: 2}).day;
const next = addDays({day: earliest, days: 1}).day;
const nextWeek = addDays({day: earliest, days: 10}).day;
const soon = noon(addDays({day: earliest, days: 3}).day);
const unreadable = 'ExpectedJsonObjectToParseKnownPrices';

const tests = [
  {
    args: {now: soon, text: makeText({version, days: [earliest]})},
    description: 'Prices that are current are ready',
    expected: {problems: []},
  },
  {
    args: {now: soon, text: 'bad\n'},
    description: 'A file that cannot be read is not ready',
    expected: {problems: [`the file cannot be read: ${unreadable}`]},
  },
  {
    args: {now: soon, text: makeText({version, days: []})},
    description: 'A file without prices is not ready',
    expected: {problems: ['there are no prices']},
  },
  {
    args: {now: soon, text: makeText({days: [earliest], version: 'old'})},
    description: 'Prices of another method version are not ready',
    expected: {problems: [`the prices are of method old, not ${version}`]},
  },
  {
    args: {now: soon, text: makeText({version, days: [next]})},
    description: 'Prices that start after the earliest day are not ready',
    expected: {problems: [`the prices start on ${next}, not on ${earliest}`]},
  },
  {
    args: {now: soon, text: makeText({version, days: [earliest, later]})},
    description: 'Days without a price are not ready',
    expected: {problems: ['days without a price: 1']},
  },
  {
    args: {
      now: noon(nextWeek),
      text: makeText({version, days: [earliest, next]}),
    },
    description: 'Prices that end over a week ago are not ready',
    expected: {problems: [`the last price is for ${next}, over a week ago`]},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected problems');

    return;
  });
});
