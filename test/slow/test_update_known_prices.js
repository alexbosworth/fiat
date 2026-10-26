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

const {assign} = Object;
const {day: earliest} = earliestSupportedDay({});
const {keys} = Object;
const {parse} = JSON;
const {stringify} = JSON;
const {version} = methodVersion({});

// Chains start on the earliest supported day and have two complete days
const genesis = Date.parse(`${earliest}T00:00:00.000Z`) / 1000;

// Known prices of the current version without any days
const empty = stringify({version, prices: {}});

test('Known prices are derived, checked and kept', async () => {
  const chain = makeChain({genesis, days: 2});
  const file = join(mkdtempSync(join(tmpdir(), 'known-')), 'prices.json');
  const lines = [];

  writeFileSync(file, empty);

  const update = spread => method({
    file,
    height: chain.tip,
    lnd: chain.lnd,
    log: line => lines.push(line),
    request: makeCandlesRequest({chain, spread}),
  });

  const first = await update(0.02);

  const days = [0, 1].map(n => chain.day_name(n));

  deepEqual(first.added, days, 'Complete days are added');
  deepEqual(first.failures, [], 'Every check passed');

  // Each day is shown against the median of its hours on Coinbase
  const shown = lines.filter(n => n.includes(' from the hourly median, '));

  deepEqual(shown.length, days.length, 'Each new day is compared');

  const {hourly, moved} = first.report;

  deepEqual(hourly.count, days.length, 'The comparisons are summarized');
  ok(hourly.percentile < 0.01, 'The prices are near the hourly medians');
  ok(lines.includes('against the hourly medians of 2 days:'), 'Summary shown');
  deepEqual(moved.count, 0, 'There was no last table to compare with');

  const text = readFileSync(file, 'utf8');

  const {prices} = parse(text);

  deepEqual(parse(text).version, version, 'The prices are of the method');
  deepEqual(keys(prices), days, 'Each day has a price');

  days.forEach(day => {
    const truth = chain.prices[day] * 100;

    ok(Math.abs(prices[day] / truth - 1) < 0.01, 'Prices are derived');

    return;
  });

  const again = await update(0.02);

  deepEqual(again.added, [], 'Nothing is added');
  deepEqual(again.failures, [], 'Rechecked days are the same');
  deepEqual(readFileSync(file, 'utf8'), text, 'The file is unchanged');

  // A changed price is caught by the recheck and the file is left alone
  const changed = stringify({
    version,
    prices: assign({}, prices, {[days[1]]: prices[days[1]] - 1}),
  });

  writeFileSync(file, changed);

  const caught = await update(0.02);

  deepEqual(caught.added, [], 'Nothing is added');
  deepEqual(caught.failures.map(n => n.day), [days[1]], 'The day is named');
  deepEqual(readFileSync(file, 'utf8'), changed, 'The file is unchanged');

  return;
});

test('A price outside the range traded stops the update', async () => {
  const chain = makeChain({genesis, days: 2});
  const file = join(mkdtempSync(join(tmpdir(), 'known-')), 'prices.json');

  writeFileSync(file, empty);

  const res = await method({
    file,
    height: chain.tip,
    lnd: chain.lnd,
    log: () => {},
    request: makeCandlesRequest({chain, spread: -0.5}),
  });

  deepEqual(res.added, [], 'Nothing is added');
  deepEqual(res.failures.map(n => n.day), [chain.day_name(0)], 'Day named');
  deepEqual(readFileSync(file, 'utf8'), empty, 'The file is unchanged');

  return;
});

test('A price far from the hourly median stops the update', async () => {
  const chain = makeChain({genesis, days: 2});
  const file = join(mkdtempSync(join(tmpdir(), 'known-')), 'prices.json');

  writeFileSync(file, empty);

  // Trading is a tenth above the price, in a range wide enough to include it
  const res = await method({
    file,
    height: chain.tip,
    lnd: chain.lnd,
    log: () => {},
    request: makeCandlesRequest({chain, shift: 0.1, spread: 0.2}),
  });

  const [failure] = res.failures;

  const far = 'the price is far from the hourly median';

  deepEqual(res.added, [], 'Nothing is added');
  deepEqual(failure.day, chain.day_name(0), 'The day is named');
  deepEqual(failure.failure, far, 'The price is too far from the median');
  deepEqual(readFileSync(file, 'utf8'), empty, 'The file is unchanged');

  return;
});

test('A failed request for candles is tried again', async ({mock}) => {
  mock.timers.enable({apis: ['setTimeout']});

  const chain = makeChain({genesis, days: 2});
  const file = join(mkdtempSync(join(tmpdir(), 'known-')), 'prices.json');
  const urls = [];

  const request = makeCandlesRequest({chain, spread: 0.02});

  writeFileSync(file, empty);

  const res = await method({
    file,
    height: chain.tip,
    lnd: chain.lnd,
    log: () => {},
    request: (args, cbk) => {
      urls.push(args.url);

      // The first request gets a server error
      if (urls.length === 1) {
        cbk(null, {statusCode: 520});

        // The wait before trying again passes at once
        return mock.timers.runAll();
      }

      return request(args, cbk);
    },
  });

  const days = [0, 1].map(n => chain.day_name(n));

  deepEqual(res.added, days, 'Every day is added');
  deepEqual(res.failures, [], 'Every check passed');
  deepEqual(urls.filter(n => n === urls[0]).length, 2, 'Request tried again');

  return;
});

test('The prices of another version are compared with new ones', async () => {
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

  writeFileSync(file, empty);

  await update();

  const {prices} = parse(readFileSync(file, 'utf8'));

  const days = keys(prices);

  // The same prices from another version, with the last a percent higher
  const higher = Math.round(prices[days[1]] * 1.01);

  const older = assign({}, prices, {[days[1]]: higher});

  writeFileSync(file, stringify({prices: older, version: '0.00000000'}));

  const res = await update();

  const {moved} = res.report;

  deepEqual(res.added.length, days.length, 'Every day is derived again');
  deepEqual(moved.count, days.length, 'Every day is compared');
  deepEqual(moved.changed, 1, 'One day moved');
  deepEqual(moved.largest[0].day, chain.day_name(1), 'The day is named');
  ok(Math.abs(moved.largest[0].difference + 0.0099) < 1e-4, 'The move');
  ok(lines.includes('1 of 2 days moved from the last table:'), 'Summarized');

  return;
});
