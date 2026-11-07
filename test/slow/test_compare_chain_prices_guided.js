const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const test = require('node:test');

const {getPriceForDate} = require('./../../chain/estimates');
const {makeRecentChain} = require('./../fixtures');
const {makeReferenceRequest} = require('./../fixtures');
const method = require('./../../scripts/compare/compare_chain_prices');
const {methodVersion} = require('./../../chain/known');
const {referenceDay} = require('./../fixtures');

const {abs} = Math;
const centsPerDollar = 100;
const dayFor = url => referenceDay({url}).day;

// The pauses between reference requests pass at once
mock.timers.enable({apis: ['setTimeout']});

// Reference providers trading all day at the price of the chain on a day
const makeRequest = (chain, options) => {
  return makeReferenceRequest(Object.assign({chain}, options, {
    timers: mock.timers,
  }));
};

// Derive the price of a date guided by the price of its guide day
const deriveGuided = args => {
  return getPriceForDate({
    date: args.date,
    get_prices: ({}, cbk) => cbk(null, {
      rates: {
        [args.guide_date]: {
          cents: args.guide_cents,
          version: methodVersion({}).version,
        },
      },
    }),
    height: args.chain.tip,
    lnd: args.chain.lnd,
    put_price: args.put_price || (({}, cbk) => cbk()),
  });
};

// Get the outcome of a derivation, as an error or as a price
const outcomeOf = promise => promise.then(res => res, err => ({err}));

// A comparison is a supported price that is close to its reference
const outcome = comparison => ({
  error: comparison.error,
  is_close: abs(comparison.difference) < 0.01,
  is_conflict: comparison.is_conflict,
  is_supported: comparison.is_supported,
  is_widened: comparison.is_widened,
});

const guided = makeRecentChain({});
const ordered = makeRecentChain({});
const sampled = makeRecentChain({});

// Day 1 is half the price of day 2, and day 3 is far below day 4
const moving = makeRecentChain({
  prices: [40123, 20123, 41234, 30123, 52345],
});

const tests = [
  {
    args: {chain: guided},
    description: 'Reference-guided dates are searched in next day windows',
    expected: {
      guide_cents: [2, 3].map(n => {
        return guided.prices[guided.day_name(n)] * centsPerDollar;
      }),
      guide_dates: [guided.day_name(2), guided.day_name(3)],
      guides_logged: [2, 3].map(n => {
        return guided.prices[guided.day_name(n)].toFixed(2);
      }),
      is_bridged: false,
      is_same_as_derived: true,
      outcomes: Array(2).fill({
        error: undefined,
        is_close: true,
        is_conflict: undefined,
        is_supported: true,
        is_widened: undefined,
      }),
      records: [guided.day_name(1), guided.day_name(2)],

      // Each day is asked for once
      requests: [1, 2, 3].map(n => guided.day_name(n)),
    },
    scenario: async ({chain}) => {
      const logs = [];
      const requests = [];

      const res = await method({
        dates: [chain.day_name(1), chain.day_name(2)],
        is_reference_guided: true,
        lnd: chain.lnd,
        logger: {info: log => logs.push(log)},
        request: (args, cbk) => {
          requests.push(dayFor(args.url));

          return makeRequest(chain)(args, cbk);
        },
      });

      // A derivation guided by the same price finds the same price
      const [first] = res.comparisons;

      const {cents} = await deriveGuided(Object.assign({chain}, first));

      const compared = logs.filter(n => !!n.compared).map(n => n.compared);

      return {
        requests,
        guide_cents: res.comparisons.map(n => n.guide_cents),
        guide_dates: res.comparisons.map(n => n.guide_date),
        guides_logged: compared.map(n => n.guide_price),
        is_bridged: res.records.some(n => !!n.is_sample),
        is_same_as_derived: cents === first.cents,
        outcomes: res.comparisons.map(outcome),
        records: res.records.map(n => n.date),
      };
    },
  },
  {
    args: {chain: moving},
    description: 'Reference-guided searches widen and check for conflicts',
    expected: {
      conflict: {
        error: undefined,
        is_close: true,
        is_conflict: true,
        is_supported: true,
        is_widened: true,
      },
      derived_conflict: 'FoundPriceAtAliasOfNeighboringDayPrice',
      is_widened_derived: true,
      widened: {
        error: undefined,
        is_close: true,
        is_conflict: undefined,
        is_supported: true,
        is_widened: true,
      },
    },
    scenario: async ({chain}) => {
      const res = await method({
        dates: [chain.day_name(1), chain.day_name(3)],
        is_reference_guided: true,
        lnd: chain.lnd,
        request: makeRequest(chain),
      });

      const [conflict, widened] = res.comparisons;

      // Derivations guided by the same prices reach the same outcomes
      const refused = await outcomeOf(deriveGuided(Object.assign({
        chain,
      },
      conflict)));
      const {cents} = await deriveGuided(Object.assign({chain}, widened));

      return {
        conflict: outcome(conflict),
        derived_conflict: refused.err[1],
        is_widened_derived: cents === widened.cents,
        widened: outcome(widened),
      };
    },
  },
  {
    args: {chain: ordered},
    description: 'A date is compared before later references are fetched',
    expected: {
      events: [
        `asked ${ordered.day_name(1)}`,
        `asked ${ordered.day_name(2)}`,
        `compared ${ordered.day_name(1)}`,
        `asked ${ordered.day_name(3)}`,
        `compared ${ordered.day_name(2)}`,
      ],
    },
    scenario: async ({chain}) => {
      const events = [];

      await method({
        dates: [chain.day_name(1), chain.day_name(2)],
        is_reference_guided: true,
        lnd: chain.lnd,
        logger: {
          info: ({compared}) => {
            return !!compared && events.push(`compared ${compared.date}`);
          },
        },
        request: (args, cbk) => {
          events.push(`asked ${dayFor(args.url)}`);

          return makeRequest(chain)(args, cbk);
        },
      });

      return {events};
    },
  },
  {
    args: {chain: sampled},
    description: 'Reference-guided dates can be estimated from samples',
    expected: {
      is_bridged_same: true,
      is_bridged_sample: true,
      is_close: true,
      is_record_sample: true,
      is_sample_of_blocks: true,
      is_supported: true,
    },
    scenario: async ({chain}) => {
      const bridged = [];

      const res = await method({
        dates: [chain.day_name(2)],
        is_reference_guided: true,
        is_sampled: true,
        lnd: chain.lnd,
        request: makeRequest(chain),
      });

      const [comparison] = res.comparisons;
      const [record] = res.records;

      // Bridging from the same guide to the day before samples the same blocks
      await deriveGuided({
        chain,
        date: chain.day_name(1),
        guide_cents: comparison.guide_cents,
        guide_date: comparison.guide_date,
        put_price: (estimate, cbk) => {
          bridged.push(estimate);

          return cbk();
        },
      });

      const sample = bridged.find(n => n.date === comparison.date);

      return {
        is_bridged_same: sample.cents === comparison.cents,
        is_bridged_sample: sample.is_sample,
        is_close: abs(comparison.difference) < 0.01,
        is_record_sample: record.is_sample,
        is_sample_of_blocks: comparison.sample_blocks < 144,
        is_supported: comparison.is_supported,
      };
    },
  },
];

tests.forEach(({args, description, expected, scenario}) => {
  return test(description, async () => {
    deepEqual(await scenario(args), expected, 'Got expected comparison');

    return;
  });
});
