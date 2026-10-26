const {deepEqual} = require('node:assert').strict;
const {mkdtempSync} = require('fs');
const {ok} = require('node:assert').strict;
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

test('Days before the shipped prices are derived to join them', async () => {
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

  // The same prices without the first day
  const later = fromEntries(entries(prices).slice(1));

  writeFileSync(file, stringify({version, prices: later}));

  const res = await update();

  deepEqual(res.added, [chain.day_name(0)], 'The day before is added');
  deepEqual(res.failures, [], 'Every check passed');
  deepEqual(readFileSync(file, 'utf8'), full, 'The prices are the same');

  const price = (prices[chain.day_name(1)] / 100).toFixed(2);

  ok(lines.includes(`${chain.day_name(1)} ${price} same`), 'Joined the same');

  return;
});

test('Days that do not join the shipped prices are not added', async () => {
  const chain = makeChain({genesis, days: 2});
  const file = join(mkdtempSync(join(tmpdir(), 'known-')), 'prices.json');

  const update = () => method({
    file,
    height: chain.tip,
    lnd: chain.lnd,
    log: () => {},
    request: makeCandlesRequest({chain, spread: 0.02}),
  });

  writeFileSync(file, empty);

  await update();

  const {prices} = parse(readFileSync(file, 'utf8'));

  // The prices without the first day, and the first kept day a cent off from
  // what its blocks give
  const off = fromEntries(entries(prices).slice(1));

  off[chain.day_name(1)] += 1;

  const later = stringify({version, prices: off});

  writeFileSync(file, later);

  const res = await update();

  deepEqual(res.added, [], 'Nothing is added');
  deepEqual(res.failures.map(n => n.day), [chain.day_name(1)], 'Day named');
  deepEqual(readFileSync(file, 'utf8'), later, 'The file is unchanged');

  return;
});
