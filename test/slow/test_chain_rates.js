const {deepEqual} = require('node:assert').strict;
const {isDeepStrictEqual} = require('util');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const method = require('./../../chain/chain_rates');
const {methodVersion} = require('./../../chain/known');

const {abs} = Math;
const centsPerDollar = 100;
const path = '/data/prices.json';
const {version} = methodVersion({});

// Chains start well after the earliest supported day and shipped prices
const genesis = Date.parse('2030-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

// An in-memory file system
const makeFs = args => {
  return {
    getFile: (path, cbk) => {
      // Exit early when there is no file at the path
      if (!args.files[path]) {
        return cbk({code: 'ENOENT'});
      }

      return cbk(null, Buffer.from(args.files[path]));
    },
    makeDirectory: (path, cbk) => cbk(),
    renameFile: (from, to, cbk) => {
      if (!!args.is_rename_failing) {
        return cbk('err');
      }

      args.files[to] = args.files[from];

      delete args.files[from];

      return cbk();
    },
    writeFile: (path, contents, cbk) => {
      if (!!args.is_write_failing) {
        return cbk('err');
      }

      args.files[path] = contents;

      return cbk();
    },
  };
};

const makeArgs = overrides => {
  const args = {path, fs: makeFs({files: {}}), lnd: makeChain({}).lnd};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const priceAt = ({date, getChainRate}) => {
  return new Promise((resolve, reject) => {
    return getChainRate({date, currency: 'BTC', fiat: 'USD'}, (err, res) => {
      return !!err ? reject(err) : resolve(res);
    });
  });
};

// Chains all start on the same day, so they share the names of their days
const dayName = makeChain({}).day_name;

// A full price of a day written by another run of the method
const external = {version, blocks: [1, 2], cents: 4234500, outputs: 1};

// Progress of fetching the blocks of a day is logged from start to end
const milestones = ['0/144', '24/144', '144/144'];

// A price is near the price of a day of a chain
const isClose = ({chain, day, price}) => {
  const cents = chain.prices[chain.day_name(day)] * centsPerDollar;

  return abs(price.cents / cents - 1) < 0.01;
};

// Look up the price of the date in the arguments with a new rates method
const lookupRate = args => {
  return priceAt({date: args.date, getChainRate: method(args).getChainRate});
};

// Get the outcome of a lookup, as an error or as a price
const outcomeOf = promise => promise.then(res => res, err => ({err}));

const tests = [
  {
    args: makeArgs({
      date: makeChain({}).day(1),
      fs: makeFs({files: {}, is_write_failing: true}),
    }),
    description: 'A failure to write the prices file is an error',
    error: [503, 'FailedToWritePricesFile', {err: 'err'}],
  },
  {
    args: {},
    description: 'A price that failed to be stored is stored next time',
    expected: {
      err: [503, 'FailedToWritePricesFile', {err: 'err'}],
      is_stored: true,
    },
    scenario: async () => {
      const chain = makeChain({});
      const files = {};
      const state = {failures: 1};

      const fs = makeFs({files});

      // Writing the file with the price of the day fails the first time
      const writeFile = (file, contents, cbk) => {
        const {rates} = JSON.parse(contents);

        if (!!rates[chain.day_name(1)] && !!state.failures) {
          state.failures--;

          return cbk('err');
        }

        return fs.writeFile(file, contents, cbk);
      };

      const {getChainRate} = method({
        path,
        fs: Object.assign({}, fs, {writeFile}),
        lnd: chain.lnd,
      });

      const date = chain.day(1);

      // The first lookup fails to store the price
      const {err} = await outcomeOf(priceAt({date, getChainRate}));

      const {cents} = await priceAt({date, getChainRate});

      const {rates} = JSON.parse(files[path]);

      return {err, is_stored: rates[chain.day_name(1)].cents === cents};
    },
  },
  {
    args: {},
    description: 'A node behind another on the file reuses its own price',
    expected: {
      fetched_again: 0,
      is_later_kept: true,
      is_same_again: true,
      written_again: 0,
    },
    scenario: async () => {
      // The node ahead is two hours of blocks further into the final day
      const ahead = makeChain({tip_hours: 20});
      const behind = makeChain({tip_hours: 18});
      const files = {};
      const writes = [];

      const fs = makeFs({files});

      const lookup = getChainRate => {
        return priceAt({getChainRate, date: ahead.day(4)});
      };

      await lookup(method({fs, path, lnd: ahead.lnd}).getChainRate);

      const day = ahead.day_name(4);

      const later = JSON.parse(files[path]).provisional[day];

      const {getChainRate} = method({
        path,
        fs: Object.assign({}, fs, {
          writeFile: (file, contents, cbk) => {
            writes.push(file);

            return fs.writeFile(file, contents, cbk);
          },
        }),
        lnd: behind.lnd,
      });

      // The price of the node ahead is from blocks unseen by the node behind
      const first = await lookup(getChainRate);

      const fetched = behind.calls.blocks;
      const written = writes.length;

      const second = await lookup(getChainRate);

      const {provisional} = JSON.parse(files[path]);

      return {
        fetched_again: behind.calls.blocks - fetched,
        is_later_kept: isDeepStrictEqual(provisional[day], later),
        is_same_again: second.cents === first.cents,
        written_again: writes.length - written,
      };
    },
  },
  {
    args: {},
    description: 'Prices are derived from chain data and stored',
    expected: {
      fetched_again: 0,

      // The temporary file is swapped in
      files: [path],
      is_each_fetch_dated: true,
      is_found: true,
      is_start_logged: true,
      is_stored_reused: true,

      // The days in between have quick estimates
      priors: [1, 2].map(dayName),
      progress: milestones,

      // The first day and the latest complete day have full prices
      rates: [0, 3].map(dayName),
      record: {version, blocks: [0, 148], has_payments: true, id_length: 64},
    },
    scenario: async () => {
      const chain = makeChain({});
      const files = {};
      const logs = [];

      const {getChainRate} = method({
        path,
        fs: makeFs({files}),
        lnd: chain.lnd,
        logger: {info: log => logs.push(log)},
      });

      // The first day is looked up starting from the latest complete day
      const first = await priceAt({getChainRate, date: chain.day(0)});

      const fetches = logs.filter(n => !!n.fetching_blocks);
      const names = Object.keys(files);
      const prices = logs.filter(n => !!n.chain_price).map(n => n.chain_price);
      const stored = JSON.parse(files[path]);

      const fetched = chain.calls.blocks;
      const logged = fetches.map(n => n.fetching_blocks.blocks);
      const record = stored.rates[chain.day_name(0)];

      // A new method reads the stored prices
      const fresh = method({path, fs: makeFs({files}), lnd: chain.lnd});

      const again = await priceAt({
        date: chain.day(0),
        getChainRate: fresh.getChainRate,
      });

      return {
        fetched_again: chain.calls.blocks - fetched,
        files: names,
        is_each_fetch_dated: fetches.every(n => !!n.fetching_blocks.date),
        is_found: isClose({chain, day: 0, price: first}),
        is_start_logged: prices.some(n => !!n.starting_from),
        is_stored_reused: isDeepStrictEqual(again, first),
        priors: Object.keys(stored.priors).sort(),
        progress: milestones.filter(n => logged.includes(n)),
        rates: Object.keys(stored.rates).sort(),
        record: {
          blocks: record.blocks,
          has_payments: record.payments > 0,
          id_length: record.block_id.length,
          version: record.version,
        },
      };
    },
  },
  {
    args: {},
    description: 'A price stored by a concurrent run is merged and used',
    expected: {
      fetched_for_merged: 0,
      is_found: true,
      merged: {cents: external.cents},

      // Full prices replace the quick estimates
      priors: {},
      rates: [0, 1, 2, 3].map(dayName),
    },
    scenario: async () => {
      const chain = makeChain({});
      const files = {};

      const {getChainRate} = method({
        path,
        fs: makeFs({files}),
        lnd: chain.lnd,
      });

      await priceAt({getChainRate, date: chain.day(0)});

      // Another concurrent run writes a full price for a bridged day
      const concurrent = JSON.parse(files[path]);

      concurrent.rates[chain.day_name(1)] = external;

      files[path] = JSON.stringify(concurrent);

      // Looking up a bridged day derives a full price for it
      const bridged = await priceAt({getChainRate, date: chain.day(2)});

      const {priors, rates} = JSON.parse(files[path]);

      const fetched = chain.calls.blocks;

      // Looking up the merged day is served from the prices without fetching
      const merged = await priceAt({getChainRate, date: chain.day(1)});

      return {
        merged,
        priors,
        fetched_for_merged: chain.calls.blocks - fetched,
        is_found: isClose({chain, day: 2, price: bridged}),
        rates: Object.keys(rates).sort(),
      };
    },
  },
  {
    args: {},
    description: 'The price of today is provisional and kept apart',
    expected: {
      fetched_again: 0,
      is_fetch_logged: true,
      is_found: true,
      is_kept_apart: true,
      is_logged: true,
      is_reused: true,

      // Today starts from the latest complete day, the only day with a rate
      rates: [dayName(3)],
    },
    scenario: async () => {
      const chain = makeChain({});
      const files = {};
      const logs = [];

      const {getChainRate} = method({
        path,
        fs: makeFs({files}),
        lnd: chain.lnd,
        logger: {info: log => logs.push(log)},
      });

      const today = await priceAt({getChainRate, date: chain.day(4)});

      const day = chain.day_name(4);
      const fetches = logs.filter(n => !!n.fetching_blocks);
      const prices = logs.filter(n => !!n.chain_price).map(n => n.chain_price);
      const {provisional, rates} = JSON.parse(files[path]);

      const fetched = chain.calls.blocks;

      // A new method reuses the recent provisional price
      const fresh = method({path, fs: makeFs({files}), lnd: chain.lnd});

      const again = await priceAt({
        date: chain.day(4),
        getChainRate: fresh.getChainRate,
      });

      return {
        fetched_again: chain.calls.blocks - fetched,
        is_fetch_logged: fetches.some(n => n.fetching_blocks.date === day),
        is_found: isClose({chain, day: 4, price: today}),
        is_kept_apart: provisional[day].cents === today.cents,
        is_logged: prices.some(n => !!n.is_provisional),
        is_reused: isDeepStrictEqual(again, today),
        rates: Object.keys(rates),
      };
    },
  },
  {
    args: {},
    description: 'Prices from other versions or chains are derived again',
    expected: {
      is_reorged_found: true,
      is_reorged_removed: true,
      is_stale_found: true,
      replaced: {version, id_length: 64},
    },
    scenario: async () => {
      const chain = makeChain({});
      const files = {};

      // A price from an old version of the method and one from blocks that a
      // reorganization of the chain replaced
      const stale = {blocks: [0, 148], cents: 1, outputs: 1, version: 'old'};

      const reorged = {
        version,
        block_id: '00',
        blocks: [293, 436],
        cents: 1e6,
      };

      files[path] = JSON.stringify({
        priors: {},
        rates: {[chain.day_name(0)]: stale, [chain.day_name(2)]: reorged},
      });

      const {getChainRate} = method({
        path,
        fs: makeFs({files}),
        lnd: chain.lnd,
      });

      const first = await priceAt({getChainRate, date: chain.day(0)});

      // The price from the reorganized chain is gone from the file for good
      const {rates} = JSON.parse(files[path]);

      const third = await priceAt({getChainRate, date: chain.day(2)});

      const stored = JSON.parse(files[path]).rates;

      return {
        is_reorged_found: isClose({chain, day: 2, price: third}),
        is_reorged_removed: !rates[chain.day_name(2)],
        is_stale_found: isClose({chain, day: 0, price: first}),
        replaced: {
          id_length: stored[chain.day_name(2)].block_id.length,
          version: stored[chain.day_name(0)].version,
        },
      };
    },
  },
  {
    args: {},
    description: 'A day that cannot be supported is not derived again',
    expected: {
      errors: Array(2).fill([
        503,
        'FailedToFindSupportedPriceToBridgeDay',
        {day: dayName(2)},
      ]),
      fetched_again: 0,
    },
    scenario: async () => {
      // The second day has no round payments at all
      const chain = makeChain({quiet_days: [2]});

      const {getChainRate} = method({
        path,
        fs: makeFs({files: {}}),
        lnd: chain.lnd,
      });

      const lookup = day => {
        return outcomeOf(priceAt({getChainRate, date: chain.day(day)}));
      };

      // A day bridged through the quiet day fails
      const first = await lookup(1);

      const fetched = chain.calls.blocks;

      // Bridging through the quiet day again fails without deriving it again
      const again = await lookup(0);

      return {
        errors: [first.err, again.err],
        fetched_again: chain.calls.blocks - fetched,
      };
    },
  },
  {
    args: {},
    description: 'A date with an offset is looked up on its day in UTC',
    expected: {is_found: true, is_same_day: true},
    scenario: async () => {
      const chain = makeChain({});

      const {getChainRate} = method({
        path,
        fs: makeFs({files: {}}),
        lnd: chain.lnd,
      });

      // The evening of the first day in California is the second day in UTC
      const date = `${chain.day_name(0)}T20:00:00-07:00`;

      const evening = await priceAt({date, getChainRate});

      const second = await priceAt({getChainRate, date: chain.day(1)});

      return {
        is_found: isClose({chain, day: 1, price: evening}),
        is_same_day: isDeepStrictEqual(evening, second),
      };
    },
  },
];

tests.forEach(({args, description, error, expected, scenario}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(lookupRate(args), error, 'Got expected error');
    } else {
      deepEqual(await scenario(args), expected, 'Got expected result');
    }

    return;
  });
});
