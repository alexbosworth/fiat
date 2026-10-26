const asyncRetry = require('async/retry');
const {join} = require('path');
const {readFileSync} = require('fs');
const {renameSync} = require('fs');
const {writeFileSync} = require('fs');

const addDays = require('./../chain/add_days');
const bitcoindLnd = require('./bitcoind_lnd');
const {centsPerDollar} = require('./../chain/constants');
const daysThrough = require('./days_through');
const differencesSummary = require('./differences_summary');
const duration = require('./duration');
const {earliestSupportedDay} = require('./../chain/known');
const {findCompleteDay} = require('./../chain/blocks');
const getCandles = require('./../coinbase/get_coinbase_day_candles');
const {getPriceForDate} = require('./../chain/estimates');
const httpsRequest = require('./https_request');
const knownPricesText = require('./known_prices_text');
const makeStore = require('./make_store');
const medianOf = require('./median_of');
const {methodVersion} = require('./../chain/known');
const {msPerSecond} = require('./../chain/constants');
const {parseKnownPrices} = require('./../chain/known');

const {abs} = Math;
const {assign} = Object;
const dayStartSeconds = day => Date.parse(`${day}T00:00:00Z`) / msPerSecond;
const defaultFile = join(__dirname, '../chain/known/known_prices.json');
const dollars = cents => (cents / centsPerDollar).toFixed(2);
const {keys} = Object;
const {max} = Math;
const maxMedianDifference = 0.05;
const {min} = Math;
const nextDayHours = 2;
const recheckDays = 7;
const retryDelaysMs = [1000, 5000, 15000, 30000, 60000];
const secondsPerHour = 60 * 60;
const signed = n => `${n < 0 ? '' : '+'}${(n * 100).toFixed(2)}%`;
const {stringify} = JSON;
const typicalPrice = n => (n.high + n.low + n.close) / 3;

/** Update the known prices file with checked prices of new days

  {
    file: <Known Prices File Path String>
    height: <Current Best Chain Height Number>
    lnd: <LND or Bitcoin Core Stand-In Object>
    log: <Log Line Function> (line) => {}
    request: <Request Function> {headers, url}, (err, r, body) => {}
  }

  @returns via Promise
  {
    added: [<Added Day YYYY-MM-DD String>]
    failures: [{
      day: <Day YYYY-MM-DD String>
      failure: <Failure Object>
    }]
    report: {
      hourly: {
        [bias]: <Median Difference From the Hourly Median Number>
        changed: <Days Different From the Hourly Median Count Number>
        count: <Days Compared Count Number>
        description: <Summary of the Differences String>
        largest: [{
          day: <Day YYYY-MM-DD String>
          difference: <Price Over Hourly Median Less One Number>
        }]
        [median]: <Median Size of the Differences Number>
        [percentile]: <95th Percentile Size of the Differences Number>
      }
      moved: {
        [bias]: <Median Move From the Last Table Number>
        changed: <Days That Moved Count Number>
        count: <Days Compared Count Number>
        description: <Summary of the Moves String>
        largest: [{
          day: <Day YYYY-MM-DD String>
          difference: <Price Over Last Table Price Less One Number>
        }]
        [median]: <Median Size of the Moves Number>
        [percentile]: <95th Percentile Size of the Moves Number>
      }
    }
  }
*/
const updateKnownPrices = async ({file, height, lnd, log, request}) => {
  const candlesByDay = new Map();
  const {version} = methodVersion({});

  const existing = parseKnownPrices({text: readFileSync(file, 'utf8')});

  const earliest = earliestSupportedDay({}).day;
  const kept = {};

  // Prices from another version of the method are all derived again
  const known = existing.version === version ? existing.rates : {};

  // Prices from another version are compared with the prices derived again
  const previous = existing.version === version ? {} : existing.rates;

  // Only the prices of supported days are kept
  const keptDays = keys(known).filter(day => day >= earliest).sort();

  keptDays.forEach(day => kept[day] = known[day]);

  const {day: latest} = await findCompleteDay({height, lnd});

  const failures = [];
  const hourly = [];
  const moves = [];
  const requested = new Set();
  const unsupported = new Map();

  const store = makeStore({log, requested, rates: kept});

  // The progress of fetching the blocks of a day and a failed starting day
  const logger = {
    info: line => {
      if (!!line.fetching_blocks) {
        const {blocks, date} = line.fetching_blocks;

        log(`  ${date} fetched ${blocks} blocks`);
      }

      if (!!line.unsupported_starting_day) {
        log(`  ${line.unsupported_starting_day} is not supported alone`);
      }

      return;
    },
  };

  // Derive the full day price of a day, guided by its nearest known price
  const derive = async day => {
    requested.add(day);

    const res = await getPriceForDate({
      height,
      lnd,
      logger,
      unsupported,
      date: day,
      get_prices: store.get_prices,
      put_price: store.put_price,
    });

    return res.cents;
  };

  // Get the range a day traded in, from the candles of it and the next day,
  // and the median of the typical prices of its own hours
  const tradedPrices = async day => {
    const next = addDays({day, days: 1}).day;

    const end = dayStartSeconds(next) + nextDayHours * secondsPerHour;

    const [today, tomorrow] = await Promise.all([day, next].map(date => {
      // The candles of a day are kept, since the next day needs them too
      if (!candlesByDay.has(date)) {
        // A failed request is tried again so a passing error cannot end a run
        const candles = asyncRetry({
          interval: count => retryDelaysMs[count - 1],
          times: retryDelaysMs.length + 1,
        },
        cbk => getCandles({date, request}, cbk));

        candlesByDay.set(date, candles.then(n => n.candles));
      }

      return candlesByDay.get(date);
    }));

    // A day is checked against the prices of its own hours
    if (!today.length) {
      throw new Error('ExpectedCoinbaseCandlesToCheckRangeTraded');
    }

    const candles = today.concat(tomorrow.filter(n => n.time < end));

    return {
      high: max(...candles.map(n => n.high)),
      low: min(...candles.map(n => n.low)),
      median: medianOf({numbers: today.map(typicalPrice)}).median,
    };
  };

  // How far the new prices are from the hourly medians and the last table
  const summarize = () => ({
    hourly: differencesSummary({differences: hourly}),
    moved: differencesSummary({differences: moves}),
  });

  log(`method ${version}, chain height ${height}, latest day ${latest}`);

  const [lastShipped] = keptDays.slice(-1);

  // Exit early when the node has not reached the shipped prices yet, since it
  // can neither check them nor add to them
  if (!!lastShipped && lastShipped > latest) {
    log(`the node is behind the shipped prices, which run to ${lastShipped}`);

    return {
      added: [],
      failures: [{
        day: lastShipped,
        failure: 'the node has not reached the last shipped day',
      }],
      report: summarize(),
    };
  }

  // Derive a kept day again, which must come out exactly the same
  const recheck = async day => {
    delete store.known.rates[day];

    const cents = await derive(day).catch(err => ({err}));

    const isSame = cents === kept[day].cents;

    if (!isSame) {
      failures.push({
        day,
        failure: !!cents.err ? cents.err : 'derived a different price',
        now: !!cents.err ? undefined : dollars(cents),
        was: dollars(kept[day].cents),
      });
    }

    log(`${day} ${dollars(kept[day].cents)} ${isSame ? 'same' : 'CHANGED'}`);
  };

  // Derive and check a run of days in order, stopping at the first failure
  const deriveRun = async ({days, is_bridged}) => {
    const added = [];
    const timing = {};

    for (const day of days) {
      const cents = await derive(day).catch(err => ({err}));

      if (!!cents.err) {
        failures.push({day, failure: cents.err});

        break;
      }

      // After a first day reached by a bridge, each day is guided only by
      // the day before it
      if (day === days[Number()] && !!is_bridged) {
        keys(store.known.priors).forEach(n => {
          delete store.known.priors[n];
        });

        const derived = keys(store.known.rates).filter(n => !kept[n]);

        derived.filter(n => n !== day).forEach(n => {
          delete store.known.rates[n];
        });
      }

      const traded = await tradedPrices(day).catch(err => ({err}));

      if (!!traded.err) {
        failures.push({day, failure: traded.err.message || traded.err});

        break;
      }

      const price = cents / centsPerDollar;

      if (price < traded.low || price > traded.high) {
        failures.push({
          day,
          failure: 'the price is outside the range traded',
          high: traded.high,
          low: traded.low,
          price: dollars(cents),
        });

        break;
      }

      const difference = price / traded.median - 1;

      // A price far from the middle of the day's trading stops the update so
      // that the day can be looked into before its price is shipped
      if (abs(difference) > maxMedianDifference) {
        failures.push({
          day,
          difference: signed(difference),
          failure: 'the price is far from the hourly median',
          median: traded.median,
          price: dollars(cents),
        });

        break;
      }

      added.push(day);

      const last = previous[day];

      hourly.push({day, difference});

      // A day that the last table had shows how far its price moved
      const move = !last ? undefined : cents / last.cents - 1;

      if (!!last) {
        moves.push({day, difference: move});
      }

      // The time left is timed from the end of the first day, which can
      // start with a long bridge
      timing.start = timing.start || Date.now();

      const timed = added.length - 1;

      const perDay = !timed ? undefined : (Date.now() - timing.start) / timed;

      const count = days.length - added.length;

      const remaining = duration({ms: perDay * count}).duration;

      const left = !perDay ? 'timing the next day' : `about ${remaining} left`;

      const moved = !last ? '' : `, ${signed(move)} from the last table`;

      log(
        `${day} ${dollars(cents)} within ${traded.low} to ${traded.high}, ` +
        `${signed(difference)} from the hourly median${moved}, ` +
        `${added.length} of ${days.length} days, ${left}`
      );
    }

    return added;
  };

  // The most recent kept days must come out the same when derived again
  const rechecks = keptDays.slice(-recheckDays).filter(day => {
    return day !== keptDays[0];
  });

  for (const day of rechecks) {
    await recheck(day);
  }

  const [firstKept] = keptDays;
  const [lastKept] = keptDays.slice(-1);

  // The supported days before the kept days, when the kept days start later
  const beforeKept = !firstKept ? {} : addDays({day: firstKept, days: -1});

  const before = !firstKept ? [] : daysThrough({
    first: earliest,
    last: beforeKept.day,
  }).days;

  if (!!before.length) {
    const {length} = before;

    log(`deriving ${length} days from ${earliest}, back from ${firstKept}`);
  }

  // The days before the kept days are bridged to from the first kept day
  const addedBefore = !!failures.length ? [] : await deriveRun({
    days: before,
    is_bridged: true,
  });

  // The first kept day must come out the same from its new neighbor
  if (!failures.length && !!addedBefore.length) {
    await recheck(firstKept);
  }

  // The days after the kept days, or every supported day when none are kept
  const afterKept = !lastKept ? {} : addDays({day: lastKept, days: 1});

  const first = afterKept.day || earliest;

  const after = daysThrough({first, last: latest}).days;

  if (!lastKept && !!after.length) {
    const {length} = after;

    log(`deriving ${length} days from ${first}, starting from ${latest}`);
  }

  // Every complete day after the kept days is derived and checked
  const addedAfter = !!failures.length ? [] : await deriveRun({
    days: after,
    is_bridged: !lastKept,
  });

  const added = addedBefore.concat(addedAfter);

  const report = summarize();

  // Show how far the new prices are from the hourly medians of their days
  if (!!report.hourly.count) {
    log(`against the hourly medians of ${report.hourly.count} days:`);
    log(`  ${report.hourly.description}`);
  }

  // Show how far the prices of another version of the method moved
  if (!!report.moved.count) {
    const {changed, count} = report.moved;

    log(`${changed} of ${count} days moved from the last table:`);
    log(`  ${report.moved.description}`);
  }

  // Exit early when a check failed or there is nothing new to write
  if (!!failures.length || !added.length) {
    return {failures, report, added: !failures.length ? added : []};
  }

  const rates = assign({}, kept);

  added.forEach(day => rates[day] = {cents: store.known.rates[day].cents});

  const {text} = knownPricesText({rates, version});

  // The file is replaced in one step so that it is never partly written
  writeFileSync(`${file}.tmp`, text);

  renameSync(`${file}.tmp`, file);

  return {added, failures, report};
};

module.exports = updateKnownPrices;

// Run when called directly, with the local Bitcoin Core
if (require.main === module) {
  (async () => {
    const {height, lnd} = await bitcoindLnd({});

    const res = await updateKnownPrices({
      height,
      lnd,
      file: defaultFile,
      log: line => console.log(line),
      request: httpsRequest,
    });

    if (!!res.failures.length) {
      console.error('Not updated, these days failed:');
      console.error(stringify(res.failures, null, 2));

      return process.exit(1);
    }

    if (!res.added.length) {
      console.log('No new days, the known prices are up to date');
    } else {
      console.log(`Added ${res.added.length} days to ${defaultFile}`);
    }

    return process.exit(0);
  })()
  .catch(err => {
    console.error(err);

    return process.exit(1);
  });
}
