const {parseArgs} = require('util');

const addDays = require('./../chain/add_days');
const alignedRows = require('./aligned_rows');
const bitcoindLnd = require('./bitcoind_lnd');
const {compareChainPrices} = require('./compare');
const differencesSummary = require('./differences_summary');
const {findCompleteDay} = require('./../chain/blocks');
const httpsRequest = require('./https_request');
const {isCalendarDay} = require('./../dates');
const {priceComparisonRows} = require('./compare');
const {progressLine} = require('./compare');

const defaultDays = 3;
const isCount = n => Number.isInteger(n) && n > 0;
const isDay = day => isCalendarDay({day}).is_calendar_day;

/** Compare chain prices with the hourly prices of days on Coinbase Exchange

  {
    args: [<Command Line Argument String>]
    height: <Chain Tip Height Number>
    lnd: <LND or Bitcoin Core Stand-In Object>
    log: <Log Line Function> (line) => {}
    request: <Request Function> {headers, url}, (err, r, body) => {}
  }

  @returns via Promise
  {
    comparisons: [<Comparison Object>]
  }
*/
const checkPrices = async ({args, height, lnd, log, request}) => {
  const {positionals, values} = parseArgs({
    args,
    allowPositionals: true,
    options: {
      'cap-near-round': {type: 'boolean'},
      days: {type: 'string'},
      'own-reference': {type: 'boolean'},
      'reference-guided': {type: 'boolean'},
      sampled: {type: 'boolean'},
      unguided: {type: 'boolean'},
    },
  });

  if (!positionals.every(isDay)) {
    throw new Error('ExpectedYyyyMmDdDatesToCheckPrices');
  }

  const count = !values.days ? defaultDays : Number(values.days);

  if (!isCount(count)) {
    throw new Error('ExpectedPositiveCountOfDaysToCheckPrices');
  }

  const dates = positionals.slice();

  // Without dates the most recent complete days are checked, latest first
  if (!dates.length) {
    const {day} = await findCompleteDay({height, lnd});

    [...Array(count).keys()].forEach(i => {
      return dates.push(addDays({day, days: -i}).day);
    });
  }

  const isGuided = !!values['reference-guided'];

  const res = await compareChainPrices({
    dates,
    lnd,
    request,
    is_capping_near_round: values['cap-near-round'],
    is_own_reference: values['own-reference'],
    is_reference_guided: isGuided,
    is_sampled: values.sampled,
    is_unguided: values.unguided,
    logger: {info: line => log(progressLine({line}).text)},
  });

  const table = priceComparisonRows({
    comparisons: res.comparisons,
    is_reference_guided: isGuided,
    is_sampled: values.sampled,
    is_unguided: values.unguided,
    records: res.records,
  });

  const compared = res.comparisons.filter(n => n.difference !== undefined);

  const {description} = differencesSummary({
    differences: compared.map(n => ({day: n.date, difference: n.difference})),
  });

  log('');

  alignedRows({rows: table.rows}).lines.forEach(line => log(line));

  log('');

  alignedRows({rows: table.rows_summary}).lines.forEach(line => log(line));

  log('');

  const days = `${compared.length} days`;

  log(`against the reference prices of ${days}: ${description}`);

  return {comparisons: res.comparisons};
};

module.exports = checkPrices;

// Run when called directly, with the local Bitcoin Core
if (require.main === module) {
  (async () => {
    const {height, lnd} = await bitcoindLnd({});

    await checkPrices({
      height,
      lnd,
      args: process.argv.slice(2),
      log: line => console.log(line),
      request: httpsRequest,
    });

    return process.exit(0);
  })()
  .catch(err => {
    console.error(err);

    return process.exit(1);
  });
}
