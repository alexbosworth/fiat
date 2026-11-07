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
const {fromEntries} = Object;
const {stringify} = JSON;
const {version} = methodVersion({});

// Chains start on the earliest supported day and have two complete days
const genesis = Date.parse(`${earliest}T00:00:00.000Z`) / 1000;

const chain = makeChain({genesis, days: 2});
const file = join(mkdtempSync(join(tmpdir(), 'known-')), 'prices.json');

// Shipped prices that run past the days the node has reached
const shipped = [...Array(10).keys()].map(n => [chain.day_name(n), 5e6]);

const text = stringify({version, prices: fromEntries(shipped)});

writeFileSync(file, text);

// Update the shipped prices, with the file and the blocks fetched afterwards
const updatePrices = async args => {
  const {added, failures} = await method(args);

  return {
    added,
    failures,
    blocks: chain.calls.blocks,
    text: readFileSync(args.file, 'utf8'),
  };
};

const tests = [
  {
    args: {
      file,
      height: chain.tip,
      lnd: chain.lnd,
      log: () => {},
      request: makeCandlesRequest({chain, spread: 0.02}),
    },
    description: 'A node behind the shipped prices stops the update',
    expected: {
      text,
      added: [],
      blocks: 0,
      failures: [{
        day: chain.day_name(9),
        failure: 'the node has not reached the last shipped day',
      }],
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await updatePrices(args), expected, 'Got expected update');

    return;
  });
});
