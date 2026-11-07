const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const test = require('node:test');

const {makeRecentChain} = require('./../fixtures');
const {makeReferenceRequest} = require('./../fixtures');
const method = require('./../../scripts/compare/compare_chain_prices');

const {abs} = Math;
const centsPerDollar = 100;

// The pauses between reference requests pass at once
mock.timers.enable({apis: ['setTimeout']});

// Reference providers trading all day at the price of the chain on a day
const makeRequest = (chain, options) => {
  return makeReferenceRequest(Object.assign({chain}, options, {
    timers: mock.timers,
  }));
};

// Compare chain prices on a chain, with the lines logged along the way when
// there is a logger, and the count of the blocks fetched at each line
const compareOn = async args => {
  const logs = [];

  const logger = {
    info: line => logs.push({line, fetched: args.chain.calls.blocks}),
  };

  const res = await method({
    dates: args.dates,
    lnd: args.chain.lnd,
    logger: !!args.is_logged ? logger : undefined,
    request: makeRequest(args.chain, args.options),
  });

  return {logs, res, fetched: args.chain.calls.blocks};
};

// The lines logged that are of a type
const linesOf = (logs, type) => logs.map(n => n.line).filter(n => !!n[type]);

const chain = makeRecentChain({});
const fallback = makeRecentChain({});
const progress = makeRecentChain({});
const quiet = makeRecentChain({quiet_days: [2]});
const quietAgain = makeRecentChain({quiet_days: [2]});

const tests = [
  {
    args: {chain, dates: [chain.day_name(1), chain.day_name(2)]},
    description: 'Derived prices are compared with reference prices',
    expected: {
      comparisons: [1, 2].map(n => chain.day_name(n)).map(date => {
        const price = chain.prices[date] * centsPerDollar;

        return {
          date,
          close_cents: price,
          error: undefined,
          is_close: true,
          open_cents: price,
          reference_cents: price,
          source: 'coinbase',
          vwap_cents: price,
        };
      }),
      is_bridged: true,
      is_full_reported: true,
    },
    measure: ({res}) => ({
      comparisons: res.comparisons.map(comparison => {
        const price = chain.prices[comparison.date] * centsPerDollar;

        const isClose = abs(comparison.cents / price - 1) < 0.01;

        return {
          close_cents: comparison.close_cents,
          date: comparison.date,
          error: comparison.error,
          is_close: isClose && abs(comparison.difference) < 0.2,
          open_cents: comparison.open_cents,
          reference_cents: comparison.reference_cents,
          source: comparison.source,
          vwap_cents: comparison.vwap_cents,
        };
      }),

      // Bridging records and full day records are reported
      is_bridged: res.records.length > res.comparisons.length,
      is_full_reported: !!res.records.find(n => !n.is_sample),
    }),
  },
  {
    args: {
      chain: fallback,
      dates: [fallback.day_name(1), fallback.day_name(2)],
      is_logged: true,
      options: {no_candles: [fallback.day_name(1)]},
    },
    description: 'CoinGecko stands in when a day has no candles',
    expected: {
      fallbacks: [{date: fallback.day_name(1), reason: 'NotFound'}],
      first: {
        close_cents: fallback.prices[fallback.day_name(2)] * centsPerDollar,
        open_cents: fallback.prices[fallback.day_name(1)] * centsPerDollar,

        // The middle of the day is between its start and the next start
        reference_cents: Math.round(Math.sqrt(
          fallback.prices[fallback.day_name(1)] * centsPerDollar *
          fallback.prices[fallback.day_name(2)] * centsPerDollar
        )),
        source: 'coingecko',
      },
      second: {source: 'coinbase'},
    },
    measure: ({logs, res}) => {
      const [first, second] = res.comparisons;

      return {
        fallbacks: linesOf(logs, 'reference_from_coingecko').map(n => ({
          date: n.reference_from_coingecko.date,
          reason: n.reference_from_coingecko.reason,
        })),
        first: {
          close_cents: first.close_cents,
          open_cents: first.open_cents,
          reference_cents: first.reference_cents,
          source: first.source,
        },
        second: {source: second.source},
      };
    },
  },
  {
    args: {chain: quiet, dates: [quiet.day_name(2)]},
    description: 'A date that cannot be priced is reported with its error',
    expected: {
      cents: undefined,
      difference: undefined,
      error: 'FailedToFindSupportedPrice',
      is_referenced: true,
    },
    measure: ({res}) => {
      const [comparison] = res.comparisons;

      return {
        cents: comparison.cents,
        difference: comparison.difference,
        error: comparison.error[1],
        is_referenced: comparison.reference_cents > 0,
      };
    },
  },
  {
    args: {
      chain: quietAgain,
      dates: [quietAgain.day_name(1), quietAgain.day_name(0)],
      is_logged: true,
    },
    description: 'A day that cannot be priced is not estimated again',
    expected: {
      days: [quietAgain.day_name(2), quietAgain.day_name(2)],
      fetched_again: 0,
      is_fetching_first: true,
    },
    measure: ({fetched, logs, res}) => {
      // The count of blocks fetched as the derivation of each date starts
      const [first, second] = logs.filter(n => !!n.line.deriving_price_for);

      return {
        days: res.comparisons.map(n => n.error[2].day),
        fetched_again: fetched - second.fetched,
        is_fetching_first: second.fetched > first.fetched,
      };
    },
  },
  {
    args: {chain: progress, dates: [progress.day_name(2)], is_logged: true},
    description: 'Progress is logged when there is a logger',
    expected: {
      compared: {
        date: progress.day_name(2),
        is_chain_price: true,
        is_difference: true,
        is_reference_price: true,
      },
      first: [
        {deriving_price_for: progress.day_name(2)},
        {fetching_blocks: {blocks: '0/144', date: progress.day_name(3)}},
        {fetching_blocks: {blocks: '24/144', date: progress.day_name(3)}},
      ],
      is_dated: true,
      is_started: true,
    },
    measure: ({logs}) => {
      const lines = logs.map(n => n.line);

      const [{compared}] = lines.slice(-1);

      const prices = linesOf(logs, 'chain_price').map(n => n.chain_price);

      return {
        compared: {
          date: compared.date,
          is_chain_price: /^\d+\.\d{2}$/.test(compared.chain_price),
          is_difference: /^-?\d+\.\d{2}%$/.test(compared.difference),
          is_reference_price: /^\d+\.\d{2}$/.test(compared.reference_price),
        },
        first: lines.slice(0, 3),
        is_dated: prices.some(n => n.date === progress.day_name(2)),
        is_started: prices.some(n => !!n.starting_from),
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
