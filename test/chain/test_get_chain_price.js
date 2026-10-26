const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/estimates/get_chain_price');
const {methodVersion} = require('./../../chain/known');

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

test('A shipped price is returned without asking LND', async () => {
  const chain = makeChain({genesis});
  const files = {};

  const date = chain.day_name(1);

  const res = await method({
    date,
    path,
    estimates: {provisional: {}, samples: 0},
    fs: makeFs({files}),
    known: {[date]: {version, cents: 123456789}},
    lnd: {},
  });

  deepEqual(res, {cents: 123456789}, 'The shipped price is returned');
  deepEqual(chain.calls.blocks, 0, 'No blocks are fetched');
  deepEqual(files, {}, 'Nothing is written');

  return;
});

test('A damaged prices file does not stop a shipped price', async () => {
  const chain = makeChain({genesis});
  const files = {[path]: 'not json'};

  const date = chain.day_name(1);

  const lookup = date => method({
    date,
    path,
    estimates: {provisional: {}, samples: 0},
    fs: makeFs({files}),
    known: {[chain.day_name(1)]: {version, cents: 123456789}},
    lnd: chain.lnd,
  });

  deepEqual(await lookup(date), {cents: 123456789}, 'The price is returned');

  await rejects(
    lookup(chain.day_name(2)),
    [503, 'FailedToParsePricesFile'],
    'A day that needs the prices file fails'
  );

  deepEqual(files[path], 'not json', 'The damaged file is left alone');

  return;
});

test('A date that is not valid is not looked up', async () => {
  const chain = makeChain({genesis});
  const files = {};

  const date = chain.day_name(1);

  // A date that starts with a shipped day but is not a date
  await rejects(
    method({
      path,
      date: `${date}not-a-date`,
      estimates: {provisional: {}, samples: 0},
      fs: makeFs({files}),
      known: {[date]: {version, cents: 123456789}},
      lnd: {},
    }),
    [400, 'ExpectedValidDateToGetChainPrice'],
    'A date has to be valid'
  );

  return;
});
