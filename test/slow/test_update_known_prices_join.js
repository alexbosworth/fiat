const {deepEqual} = require('node:assert').strict;
const {mkdtempSync} = require('fs');
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

const {day: earliest} = earliestSupportedDay({});
const {entries} = Object;
const {fromEntries} = Object;
const {parse} = JSON;
const {stringify} = JSON;
const {version} = methodVersion({});

// Chains start on the earliest supported day and have two complete days
const genesis = Date.parse(`${earliest}T00:00:00.000Z`) / 1000;

// Known prices of the current version without any days
const empty = stringify({version, prices: {}});

// The days of the chains, which all start on the same day
const days = makeChain({genesis, days: 2});

// Update the shipped prices of a new chain from nothing, change the prices in
// the file, and update them again, with what the second update did
const updateAgain = async ({change}) => {
  const chain = makeChain({genesis, days: 2});
  const file = join(mkdtempSync(join(tmpdir(), 'known-')), 'prices.json');
  const lines = [];

  const update = () => method({
    file,
    height: chain.tip,
    lnd: chain.lnd,
    log: line => lines.push(line),
    request: makeCandlesRequest({chain, spread: 0.02}),
  });

  // Every day from the earliest supported day
  writeFileSync(file, empty);

  await update();

  const full = readFileSync(file, 'utf8');

  const {prices} = parse(full);

  const changed = stringify({version, prices: change({prices})});

  writeFileSync(file, changed);

  const res = await update();

  const day = chain.day_name(1);

  const text = readFileSync(file, 'utf8');

  return {
    added: res.added,
    failures: res.failures.map(n => n.day),
    is_changed_file: text === changed,
    is_full_file: text === full,
    is_joined: lines.includes(`${day} ${(prices[day] / 100).toFixed(2)} same`),
  };
};

const tests = [
  {
    args: {
      change: ({prices}) => fromEntries(entries(prices).slice(1)),
    },
    description: 'Days before the shipped prices are derived to join them',
    expected: {
      added: [days.day_name(0)],
      failures: [],
      is_changed_file: false,
      is_full_file: true,
      is_joined: true,
    },
  },
  {
    args: {
      change: ({prices}) => {
        // The first kept day is a cent off from what its blocks give
        const off = fromEntries(entries(prices).slice(1));

        off[days.day_name(1)] += 1;

        return off;
      },
    },
    description: 'Days that do not join the shipped prices are not added',
    expected: {
      added: [],
      failures: [days.day_name(1)],
      is_changed_file: true,
      is_full_file: false,
      is_joined: false,
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await updateAgain(args), expected, 'Got expected update');

    return;
  });
});
