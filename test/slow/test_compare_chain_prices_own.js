const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const test = require('node:test');

const {makeRecentChain} = require('./../fixtures');
const {makeReferenceRequest} = require('./../fixtures');
const method = require('./../../scripts/compare/compare_chain_prices');

const {abs} = Math;

// The pauses between reference requests pass at once
mock.timers.enable({apis: ['setTimeout']});

// Reference providers trading all day at the price of the chain on a day
const makeRequest = (chain, options) => {
  return makeReferenceRequest(Object.assign({chain}, options, {
    timers: mock.timers,
  }));
};

// Compare chain prices on a chain, with the lines that were logged
const compareOn = async ({chain, options}) => {
  const logs = [];

  const res = await method(Object.assign({}, options, {
    lnd: chain.lnd,
    logger: {info: log => logs.push(log)},
    request: makeRequest(chain),
  }));

  return {logs, res};
};

// The price jumps by eight percent at 11:00 every day
const hourlyMoves = [...Array(24).keys()].map(hour => hour < 11 ? 0 : 0.08);

const capped = makeRecentChain({});
const quiet = makeRecentChain({quiet_days: [2]});

// Every payment of a round amount on a day comes to the same value
const exact = makeRecentChain({price_jitter: 0});

const jumpy = makeRecentChain({
  hourly_moves: hourlyMoves,
  prices: Array(5).fill(60000),
});

const tests = [
  {
    args: {
      chain: quiet,
      options: {
        dates: [quiet.day_name(1), quiet.day_name(2), quiet.day_name(3)],
        is_unguided: true,
      },
    },
    description: 'Dates are estimated on their own when unguided',
    expected: {
      bridging_logs: 0,
      is_compared: true,
      is_reported: true,
      is_third_close: true,
      is_unsupported_logged: [undefined, true, undefined],
      payments_logged: [true, true, true],
      records: [quiet.day_name(1), quiet.day_name(2), quiet.day_name(3)],
      records_bridged: false,
      records_supported: [true, false, true],
      supported: [true, false, true],
    },
    measure: ({logs, res}) => {
      const [, unsupported, third] = res.comparisons;

      const compared = logs.filter(n => !!n.compared).map(n => n.compared);

      const price = quiet.prices[third.date] * 100;

      return {
        bridging_logs: logs.filter(n => !!n.chain_price).length,

        // The unsupported estimate is still reported and compared
        is_compared: unsupported.difference !== undefined,
        is_reported: unsupported.cents > 0,
        is_third_close: abs(third.cents / price - 1) < 0.02,
        is_unsupported_logged: compared.map(n => n.is_unsupported),
        payments_logged: compared.map(n => n.payments > 0),
        records: res.records.map(n => n.date),
        records_bridged: res.records.some(n => !!n.is_sample),
        records_supported: res.records.map(n => n.is_supported),
        supported: res.comparisons.map(n => n.is_supported),
      };
    },
  },
  {
    args: {
      chain: capped,
      options: {
        dates: [capped.day_name(1)],
        is_capping_near_round: true,
        is_unguided: true,
      },
    },
    description: 'Own block estimates can cap values just off round amounts',
    expected: {is_close: true, is_supported: true},
    measure: ({res}) => {
      const [comparison] = res.comparisons;

      return {
        is_close: abs(comparison.difference) < 0.01,
        is_supported: comparison.is_supported,
      };
    },
  },
  {
    args: {
      chain: exact,
      options: {dates: [exact.day_name(1)], is_unguided: true},
    },
    description: 'Many payments of one exact amount count ten times',
    expected: {is_capped: true},
    measure: ({res}) => {
      const [record] = res.records;

      // Thousands of round payments repeat a few dozen exact values
      return {is_capped: record.payments < 500};
    },
  },
  {
    args: {
      chain: jumpy,
      options: {
        dates: [jumpy.day_name(2)],
        is_reference_guided: true,
        is_sampled: true,
      },
    },
    description: 'A date not supported as a whole is estimated in windows',
    expected: {
      is_median: true,
      is_supported: true,
      is_windows_supported: true,
      record_windows: true,
      windows: 12,
    },
    measure: ({res}) => {
      const [comparison] = res.comparisons;
      const [record] = res.records;

      const supported = comparison.windows.filter(n => !!n.is_supported);

      return {
        // The day spent more of its time after the jump than before it
        is_median: abs(comparison.cents / 6480000 - 1) < 0.005,
        is_supported: comparison.is_supported,
        is_windows_supported: supported.length >= 10,
        record_windows: record.windows === supported.length,
        windows: comparison.windows.length,
      };
    },
  },
];

tests.forEach(({args, description, expected, measure}) => {
  return test(description, async () => {
    deepEqual(measure(await compareOn(args)), expected, 'Got comparison');

    return;
  });
});
