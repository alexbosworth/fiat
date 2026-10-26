const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const method = require('./../../chain/chain_rates');
const {methodVersion} = require('./../../chain/known');

const centsPerDollar = 100;
const path = '/data/prices.json';
const {version} = methodVersion({});

// Chains start well after the earliest supported day and shipped prices
const genesis = Date.parse('2030-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

// An in-memory file system
const makeFs = args => {
  const {files} = args;

  return {
    getFile: (path, cbk) => {
      if (!files[path]) {
        return cbk({code: 'ENOENT'});
      }

      return cbk(null, Buffer.from(files[path]));
    },
    makeDirectory: (path, cbk) => cbk(),
    renameFile: (from, to, cbk) => {
      if (!!args.is_rename_failing) {
        return cbk('err');
      }

      files[to] = files[from];

      delete files[from];

      return cbk();
    },
    writeFile: (path, contents, cbk) => {
      if (!!args.is_write_failing) {
        return cbk('err');
      }

      files[path] = contents;

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

test('A failure to write the prices file is an error', async () => {
  const fs = makeFs({files: {}, is_write_failing: true});

  const {getChainRate} = method(makeArgs({fs}));

  await rejects(
    priceAt({getChainRate, date: makeChain({}).day(1)}),
    [503, 'FailedToWritePricesFile'],
    'Got expected error'
  );

  return;
});

test('A price that failed to be stored is stored next time', async () => {
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

  await rejects(
    priceAt({date, getChainRate}),
    [503, 'FailedToWritePricesFile'],
    'The first lookup fails to store the price'
  );

  const {cents} = await priceAt({date, getChainRate});

  const {rates} = JSON.parse(files[path]);

  deepEqual(rates[chain.day_name(1)].cents, cents, 'The price is in the file');

  return;
});

test('A node behind another on the file reuses its own price', async () => {
  // The node ahead is two hours of blocks further into the final day
  const ahead = makeChain({tip_hours: 20});
  const behind = makeChain({tip_hours: 18});
  const files = {};
  const writes = [];

  const fs = makeFs({files});

  const lookup = getChainRate => priceAt({getChainRate, date: ahead.day(4)});

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

  // The price of the node ahead is from blocks the node behind has not seen
  const first = await lookup(getChainRate);

  const fetched = behind.calls.blocks;
  const written = writes.length;

  const second = await lookup(getChainRate);

  deepEqual(second.cents, first.cents, 'The same price is found again');
  deepEqual(behind.calls.blocks, fetched, 'No blocks are fetched again');
  deepEqual(writes.length, written, 'The file is not written again');

  const {provisional} = JSON.parse(files[path]);

  deepEqual(provisional[day], later, 'The file keeps the later price');

  return;
});

test('Prices are derived from chain data and stored', async () => {
  const chain = makeChain({});
  const files = {};
  const logs = [];

  const {getChainRate} = method({
    path,
    fs: makeFs({files}),
    lnd: chain.lnd,
    logger: {info: log => logs.push(log)},
  });

  const isClose = (cents, day) => {
    return Math.abs(cents / centsPerDollar / chain.prices[day] - 1) < 0.01;
  };

  // Looking up the first day requires starting from the latest complete day
  const first = await priceAt({getChainRate, date: chain.day(0)});

  ok(isClose(first.cents, chain.day_name(0)), 'Price found');

  deepEqual(Object.keys(files), [path], 'Temporary file is swapped in');

  const stored = JSON.parse(files[path]);

  deepEqual(
    Object.keys(stored.rates).sort(),
    [chain.day_name(0), chain.day_name(3)],
    'The first day and the latest complete day have full prices'
  );

  deepEqual(
    Object.keys(stored.priors).sort(),
    [chain.day_name(1), chain.day_name(2)],
    'The days in between have quick estimates'
  );

  const prices = logs.filter(n => !!n.chain_price).map(n => n.chain_price);
  const fetches = logs.filter(n => !!n.fetching_blocks);

  ok(prices.find(n => !!n.starting_from), 'Start is logged');
  const progress = fetches.map(n => n.fetching_blocks.blocks);

  ok(progress.includes('0/144'), 'Fetching start is logged');
  ok(progress.includes('24/144'), 'Fetching progress is logged');
  ok(progress.includes('144/144'), 'Fetching completion is logged');
  ok(fetches.every(n => !!n.fetching_blocks.date), 'Fetches are dated');

  // Another concurrent run writes a full price for a bridged day
  const external = {version, blocks: [1, 2], cents: 4234500, outputs: 1};

  const concurrent = JSON.parse(files[path]);

  concurrent.rates[chain.day_name(1)] = external;

  files[path] = JSON.stringify(concurrent);

  // Looking up a bridged day derives a full price for it
  const second = await priceAt({getChainRate, date: chain.day(2)});

  ok(isClose(second.cents, chain.day_name(2)), 'Price found');

  const updated = JSON.parse(files[path]);

  deepEqual(
    Object.keys(updated.rates).sort(),
    [0, 1, 2, 3].map(chain.day_name),
    'The concurrent run price is merged into the prices file'
  );

  deepEqual(updated.priors, {}, 'Full prices replace the quick estimates');

  // Looking up today gives a provisional price that is kept apart
  const today = await priceAt({getChainRate, date: chain.day(4)});

  ok(isClose(today.cents, chain.day_name(4)), 'Price found');

  const {provisional, rates} = JSON.parse(files[path]);

  deepEqual(rates, updated.rates, 'Provisional is not stored as a rate');
  deepEqual(provisional[chain.day_name(4)].cents, today.cents, 'Kept apart');

  ok(logs.find(n => !!n.chain_price && !!n.chain_price.is_provisional));
  const todays = logs.filter(n => {
    return !!n.fetching_blocks && n.fetching_blocks.date === chain.day_name(4);
  });

  ok(!!todays.length, 'Fetching the provisional blocks is logged');

  // Looking up a merged day is served from the prices without fetching
  const fetched = chain.calls.blocks;

  const merged = await priceAt({getChainRate, date: chain.day(1)});

  deepEqual(merged, {cents: external.cents}, 'Merged price is used');
  deepEqual(chain.calls.blocks, fetched, 'No blocks fetched for merged day');

  // A fresh getChainRate method reads the stored prices
  const fresh = method({path, fs: makeFs({files}), lnd: chain.lnd});

  const cached = await priceAt({
    date: chain.day(0),
    getChainRate: fresh.getChainRate,
  });

  deepEqual(cached, first, 'The stored price is returned');
  deepEqual(chain.calls.blocks, fetched, 'No blocks are fetched');

  // Another lookup of today reuses the recent provisional price
  const again = await priceAt({
    date: chain.day(4),
    getChainRate: fresh.getChainRate,
  });

  deepEqual(again, today, 'The stored provisional price is reused');
  deepEqual(chain.calls.blocks, fetched, 'No blocks are fetched for today');

  const record = JSON.parse(files[path]).rates[chain.day_name(0)];

  deepEqual(record.version, version, 'The method version is stored');
  deepEqual(record.blocks, [0, 148], 'The block range is stored');
  deepEqual(record.hash.length, 64, 'The last block hash is stored');
  deepEqual(record.payments > 0, true, 'The payments count is stored');

  return;
});

test('Prices from other versions or chains are derived again', async () => {
  const chain = makeChain({});
  const files = {};

  // A price from an old version of the method and one from a reorganized chain
  const stale = {blocks: [0, 148], cents: 1, outputs: 1, version: 'old'};
  const reorged = {version, blocks: [293, 436], cents: 1e6, hash: '00'};

  files[path] = JSON.stringify({
    priors: {},
    rates: {[chain.day_name(0)]: stale, [chain.day_name(2)]: reorged},
  });

  const {getChainRate} = method({path, fs: makeFs({files}), lnd: chain.lnd});

  const isClose = (cents, day) => {
    return Math.abs(cents / centsPerDollar / chain.prices[day] - 1) < 0.01;
  };

  const first = await priceAt({getChainRate, date: chain.day(0)});

  ok(isClose(first.cents, chain.day_name(0)), 'Stale price is derived again');

  // The price from the reorganized chain is gone from the file for good
  const kept = JSON.parse(files[path]).rates;

  deepEqual(kept[chain.day_name(2)], undefined, 'Reorged price is removed');

  const third = await priceAt({getChainRate, date: chain.day(2)});

  ok(isClose(third.cents, chain.day_name(2)), 'Reorged price derived again');

  const stored = JSON.parse(files[path]).rates;

  deepEqual(stored[chain.day_name(0)].version, version, 'Stale is replaced');
  deepEqual(stored[chain.day_name(2)].hash.length, 64, 'Reorged is replaced');

  return;
});

test('A day that cannot be supported is not derived again', async () => {
  // The second day has no round payments at all
  const chain = makeChain({quiet_days: [2]});

  const {getChainRate} = method({
    path,
    fs: makeFs({files: {}}),
    lnd: chain.lnd,
  });

  const error = [503, 'FailedToFindSupportedPriceToBridgeDay', {
    day: chain.day_name(2),
  }];

  await rejects(
    priceAt({getChainRate, date: chain.day(1)}),
    error,
    'Quiet day fails'
  );

  const fetched = chain.calls.blocks;

  await rejects(
    priceAt({getChainRate, date: chain.day(0)}),
    error,
    'Bridging fails'
  );

  deepEqual(chain.calls.blocks, fetched, 'The quiet day is not derived again');

  return;
});

test('A date with an offset is looked up on its day in UTC', async () => {
  const chain = makeChain({});
  const files = {};

  const {getChainRate} = method({path, fs: makeFs({files}), lnd: chain.lnd});

  // The evening of the first day in California is the second day in UTC
  const date = `${chain.day_name(0)}T20:00:00-07:00`;

  const evening = await priceAt({date, getChainRate});

  const second = await priceAt({getChainRate, date: chain.day(1)});

  deepEqual(evening, second, 'The day in UTC is looked up');

  const expected = chain.prices[chain.day_name(1)] * centsPerDollar;

  ok(Math.abs(evening.cents / expected - 1) < 0.01, 'The price is found');

  return;
});
