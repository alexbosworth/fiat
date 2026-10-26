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

test('A node behind the shipped prices stops the update', async () => {
  const chain = makeChain({genesis, days: 2});
  const file = join(mkdtempSync(join(tmpdir(), 'known-')), 'prices.json');

  // Shipped prices that run past the days the node has reached
  const shipped = [...Array(10).keys()].map(n => [chain.day_name(n), 5e6]);

  const text = stringify({version, prices: fromEntries(shipped)});

  writeFileSync(file, text);

  const res = await method({
    file,
    height: chain.tip,
    lnd: chain.lnd,
    log: () => {},
    request: makeCandlesRequest({chain, spread: 0.02}),
  });

  deepEqual(res.added, [], 'Nothing is added');

  deepEqual(
    res.failures,
    [{
      day: chain.day_name(9),
      failure: 'the node has not reached the last shipped day',
    }],
    'The update stops'
  );

  deepEqual(readFileSync(file, 'utf8'), text, 'The file is left as it was');
  deepEqual(chain.calls.blocks, 0, 'No blocks are fetched');

  return;
});
