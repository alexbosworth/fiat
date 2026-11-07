const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/estimates/get_chain_price');
const {methodVersion} = require('./../../chain/known');

const {abs} = Math;
const centsPerDollar = 100;
const genesis = Date.parse('2030-01-01T00:00:00.000Z') / 1000;
const path = '/data/prices.json';
const {version} = methodVersion({});

const chain = makeChain({genesis});

// The last day with a shipped price, and the day after it
const shipped = chain.day_name(1);
const date = chain.day_name(2);

// An in-memory file system
const makeFs = ({files}) => ({
  files,
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

// Get a chain price, with the days known and stored after
const chainPrice = async args => {
  const {cents} = await method(args);

  const truth = chain.prices[args.date] * centsPerDollar;

  return {
    is_derived: abs(cents / truth - 1) < 0.01,
    priors: args.estimates.priors,
    rates: Object.keys(args.estimates.rates),
    stored: Object.keys(JSON.parse(args.fs.files[path]).rates),
  };
};

const tests = [
  {
    args: {
      date,
      path,
      estimates: {provisional: {}, samples: 0},
      fs: makeFs({files: {}}),
      known: {
        [shipped]: {version, cents: chain.prices[shipped] * centsPerDollar},
      },
      lnd: chain.lnd,
    },
    description: 'A day after the shipped prices is derived from the last',
    expected: {is_derived: true, priors: {}, rates: [date], stored: [date]},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await chainPrice(args), expected, 'Got expected price');

    return;
  });
});
