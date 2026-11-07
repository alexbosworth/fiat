const {deepEqual} = require('node:assert').strict;
const {mkdtempSync} = require('fs');
const {mock} = require('node:test');
const {readFileSync} = require('fs');
const test = require('node:test');
const {tmpdir} = require('os');
const {join} = require('path');
const {writeFileSync} = require('fs');

const {earliestSupportedDay} = require('./../../chain/known');
const {makeCandlesRequest} = require('./../fixtures');
const {makeChain} = require('./../fixtures');
const method = require('./../../scripts/update_known_prices');
const {methodVersion} = require('./../../chain/known');

const {abs} = Math;
const {assign} = Object;
const {day: earliest} = earliestSupportedDay({});
const {keys} = Object;
const {parse} = JSON;
const {stringify} = JSON;
const {version} = methodVersion({});

// Chains start on the earliest supported day and have two complete days
const genesis = Date.parse(`${earliest}T00:00:00.000Z`) / 1000;

// Known prices of the current version without any days
const empty = stringify({version, prices: {}});

// The days of the chains, which all start on the same day
const chainDays = makeChain({genesis, days: 2});

const days = [0, 1].map(n => chainDays.day_name(n));

// Make a chain and a file of known prices without any days
const makeUpdate = () => {
  const chain = makeChain({genesis, days: 2});
  const file = join(mkdtempSync(join(tmpdir(), 'known-')), 'prices.json');

  writeFileSync(file, empty);

  return {chain, file};
};

// Update the known prices of a chain, with the lines that were logged
const updateWith = async ({chain, file, request}) => {
  const lines = [];

  const res = await method({
    file,
    height: chain.tip,
    lnd: chain.lnd,
    log: line => lines.push(line),
    request: request || makeCandlesRequest({chain, spread: 0.02}),
  });

  return {lines, res};
};

const tests = [
  {
    args: {},
    description: 'Known prices are derived, checked and kept',
    expected: {
      again: {added: [], failures: [], is_unchanged: true},
      caught: {added: [], failures: [days[1]], is_unchanged: true},
      first: {
        added: days,
        days,
        failures: [],
        hourly: days.length,
        is_derived: true,
        is_near_hourly: true,
        is_summarized: true,
        moved: 0,
        shown: days.length,
        version,
      },
    },
    scenario: async () => {
      const {chain, file} = makeUpdate();

      const first = await updateWith({chain, file});

      const text = readFileSync(file, 'utf8');

      const {prices} = parse(text);

      const again = await updateWith({chain, file});

      // A changed price is caught by the recheck and the file is left alone
      const changed = stringify({
        version,
        prices: assign({}, prices, {[days[1]]: prices[days[1]] - 1}),
      });

      writeFileSync(file, changed);

      const caught = await updateWith({chain, file});

      // Each day is shown against the median of its hours on Coinbase
      const shown = first.lines.filter(n => {
        return n.includes(' from the hourly median, ');
      });

      const summary = 'against the hourly medians of 2 days:';

      return {
        again: {
          added: again.res.added,
          failures: again.res.failures,
          is_unchanged: readFileSync(file, 'utf8') === changed,
        },
        caught: {
          added: caught.res.added,
          failures: caught.res.failures.map(n => n.day),
          is_unchanged: readFileSync(file, 'utf8') === changed,
        },
        first: {
          added: first.res.added,
          days: keys(prices),
          failures: first.res.failures,
          hourly: first.res.report.hourly.count,
          is_derived: days.every(day => {
            return abs(prices[day] / (chain.prices[day] * 100) - 1) < 0.01;
          }),
          is_near_hourly: first.res.report.hourly.percentile < 0.01,
          is_summarized: first.lines.includes(summary),
          moved: first.res.report.moved.count,
          shown: shown.length,
          version: parse(text).version,
        },
      };
    },
  },
  {
    args: {spread: -0.5},
    description: 'A price outside the range traded stops the update',
    expected: {added: [], failures: [days[0]], is_unchanged: true},
    scenario: async ({spread}) => {
      const {chain, file} = makeUpdate();

      const {res} = await updateWith({
        chain,
        file,
        request: makeCandlesRequest({chain, spread}),
      });

      return {
        added: res.added,
        failures: res.failures.map(n => n.day),
        is_unchanged: readFileSync(file, 'utf8') === empty,
      };
    },
  },
  {
    args: {shift: 0.1, spread: 0.2},
    description: 'A price far from the hourly median stops the update',
    expected: {
      added: [],
      failures: [{
        day: days[0],
        failure: 'the price is far from the hourly median',
      }],
      is_unchanged: true,
    },
    scenario: async ({shift, spread}) => {
      const {chain, file} = makeUpdate();

      // Trading is a tenth above the price, in a range wide enough for it
      const {res} = await updateWith({
        chain,
        file,
        request: makeCandlesRequest({chain, shift, spread}),
      });

      return {
        added: res.added,
        failures: res.failures.map(n => ({day: n.day, failure: n.failure})),
        is_unchanged: readFileSync(file, 'utf8') === empty,
      };
    },
  },
  {
    args: {},
    description: 'A failed request for candles is tried again',
    expected: {added: days, asked_again: 2, failures: []},
    scenario: async () => {
      const {chain, file} = makeUpdate();
      const urls = [];

      const request = makeCandlesRequest({chain, spread: 0.02});

      mock.timers.enable({apis: ['setTimeout']});

      const {res} = await updateWith({
        chain,
        file,
        request: (args, cbk) => {
          urls.push(args.url);

          // Exit early when this is not the first request
          if (urls.length !== 1) {
            return request(args, cbk);
          }

          // The first request gets a server error
          cbk(null, {statusCode: 520});

          // The wait before trying again passes at once
          return mock.timers.runAll();
        },
      });

      mock.timers.reset();

      return {
        added: res.added,
        asked_again: urls.filter(n => n === urls[0]).length,
        failures: res.failures,
      };
    },
  },
  {
    args: {},
    description: 'The prices of another version are compared with new ones',
    expected: {
      added: days.length,
      changed: 1,
      compared: days.length,
      is_move_measured: true,
      is_summarized: true,
      moved_day: days[1],
    },
    scenario: async () => {
      const {chain, file} = makeUpdate();

      await updateWith({chain, file});

      const {prices} = parse(readFileSync(file, 'utf8'));

      // The same prices from another version, with the last a percent higher
      const older = assign({}, prices, {
        [days[1]]: Math.round(prices[days[1]] * 1.01),
      });

      writeFileSync(file, stringify({prices: older, version: '0.00000000'}));

      const {lines, res} = await updateWith({chain, file});

      const {moved} = res.report;

      const summary = '1 of 2 days moved from the last table:';

      return {
        added: res.added.length,
        changed: moved.changed,
        compared: moved.count,
        is_move_measured: abs(moved.largest[0].difference + 0.0099) < 1e-4,
        is_summarized: lines.includes(summary),
        moved_day: moved.largest[0].day,
      };
    },
  },
];

tests.forEach(({args, description, expected, scenario}) => {
  return test(description, async () => {
    deepEqual(await scenario(args), expected, 'Got expected update');

    return;
  });
});
