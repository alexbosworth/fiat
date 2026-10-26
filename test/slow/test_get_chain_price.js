const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/estimates/get_chain_price');
const {methodVersion} = require('./../../chain/known');

const centsPerDollar = 100;
const genesis = Date.parse('2030-01-01T00:00:00.000Z') / 1000;
const path = '/data/prices.json';
const {version} = methodVersion({});

// An in-memory file system
const makeFs = ({files}) => ({
  getFile: (path, cbk) => {
    const missing = {code: 'ENOENT'};

    return !files[path] ? cbk(missing) : cbk(null, Buffer.from(files[path]));
  },
  makeDirectory: (path, cbk) => cbk(),
  renameFile: (from, to, cbk) => {
    files[to] = files[from];

    delete files[from];

    return cbk();
  },
  writeFile: (path, contents, cbk) => {
    files[path] = contents;

    return cbk();
  },
});

test('A day after the shipped prices is derived from the last', async () => {
  const chain = makeChain({genesis});
  const estimates = {provisional: {}, samples: 0};
  const files = {};

  const shipped = chain.day_name(1);
  const date = chain.day_name(2);

  const known = {
    [shipped]: {version, cents: chain.prices[shipped] * centsPerDollar},
  };

  const res = await method({
    date,
    estimates,
    known,
    path,
    fs: makeFs({files}),
    lnd: chain.lnd,
  });

  const truth = chain.prices[date] * centsPerDollar;

  ok(Math.abs(res.cents / truth - 1) < 0.01, 'The price is derived');

  deepEqual(Object.keys(estimates.rates), [date], 'Only the day is stored');
  deepEqual(estimates.priors, {}, 'No days were bridged');

  const stored = JSON.parse(files[path]);

  deepEqual(Object.keys(stored.rates), [date], 'Shipped prices are not kept');

  return;
});
