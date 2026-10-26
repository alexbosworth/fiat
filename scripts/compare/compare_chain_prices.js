const asyncAuto = require('async/auto');
const asyncMapSeries = require('async/mapSeries');
const {getHeight} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const addDays = require('./../../chain/add_days');
const {centsPerDollar} = require('./../../chain/constants');
const compareToReference = require('./compare_to_reference');
const estimateOwnDay = require('./estimate_own_day');
const {getPriceForDate} = require('./../../chain/estimates');
const getReferencePrices = require('./get_reference_prices');
const {isCalendarDay} = require('./../../dates');
const {rememberEstimate} = require('./../../chain/estimates');
const {sampleLogInterval} = require('./../../chain/constants');

const {assign} = Object;
const dollars = cents => (cents / centsPerDollar).toFixed(2);
const {isArray} = Array;
const isDay = day => isCalendarDay({day}).is_calendar_day;
const nextDay = 1;
const sameDay = 0;

/** Compare prices derived from chain data against a rate provider

  {
    dates: [<Day YYYY-MM-DD String>]
    [is_capping_near_round]: <Cap Values Just Off Round BTC Amounts Too Bool>
    [is_own_reference]: <Guide Each Date By Its Own Reference Price Bool>
    [is_reference_guided]: <Search the Window of the Next Day Reference Bool>
    [is_sampled]: <Estimate Guided Dates From Samples Like Bridging Bool>
    [is_unguided]: <Estimate Each Date From Its Own Blocks Alone Bool>
    lnd: <Authenticated LND API Object>
    [logger]: <Winston Logger Object>
    request: <Request Function> {headers, url}, (err, r, body) => {}
  }

  @returns via cbk or Promise
  {
    comparisons: [{
      [cents]: <Derived USD Cents Per BTC Number>
      date: <Day YYYY-MM-DD String>
      [difference]: <Derived Price Over Reference Price Minus One Number>
      [error]: <Derivation or Reference Error Array>
      [guide_cents]: <Reference USD Cents Per BTC Guiding the Search Number>
      [guide_date]: <Day of the Guiding Reference Price YYYY-MM-DD String>
      [is_conflict]: <Supported Price Is At An Alias Ratio of Its Guide Bool>
      [is_supported]: <Derived Price Is Supported By the Data Bool>
      [is_widened]: <Search Was Widened Beyond the Guide Window Bool>
      [open_cents]: <Day First Trade or Start USD Cents Number>
      [close_cents]: <Day Last Trade or Next Day Start USD Cents Number>
      [reference_cents]: <Reference USD Cents Per BTC Number>
      [sample_blocks]: <Blocks In the Sample Count Number>
      [source]: <Reference Price Provider Name String>
      [vwap_cents]: <Day Volume Weighted Average USD Cents Per BTC Number>
      [windows]: [{
        blocks: [<First Block Height Number>, <Last Block Height Number>]
        [cents]: <USD Cents Per BTC Number>
        is_supported: <Window Price Is Supported By the Data Bool>
        [is_widened]: <Search Was Widened Beyond the Price Window Bool>
        seconds: <Time Covered By the Window Seconds Number>
      }]
    }]
    records: [<Reported Estimate Record Object>]
  }
*/
module.exports = (args, cbk) => {
  const {dates, lnd, logger, request} = args;

  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isArray(dates) || !dates.every(isDay)) {
          return cbk([400, 'ExpectedYyyyMmDdDatesToCompareChainPrices']);
        }

        if (!!args.is_own_reference && !args.is_reference_guided) {
          return cbk([400, 'ExpectedReferenceGuidedModeForOwnReference']);
        }

        if (!!args.is_sampled && !args.is_reference_guided) {
          return cbk([400, 'ExpectedReferenceGuidedModeForSampling']);
        }

        if (!!args.is_reference_guided && !!args.is_unguided) {
          return cbk([400, 'ExpectedOneModeToCompareChainPrices']);
        }

        const isOwnBlocks = !!args.is_reference_guided || !!args.is_unguided;

        if (!!args.is_capping_near_round && !isOwnBlocks) {
          return cbk([400, 'ExpectedOwnBlockEstimatesToCapNearRoundValues']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToCompareChainPrices']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestFunctionToCompareChainPrices']);
        }

        return cbk();
      },

      // Get the current chain height
      getHeight: ['validate', ({}, cbk) => getHeight({lnd}, cbk)],

      // The day whose reference price guides the search for each date
      guides: ['validate', ({}, cbk) => {
        // Exit early when the searches are not guided by reference prices
        if (!args.is_reference_guided) {
          return cbk(null, {});
        }

        // Bridging walks backward from the present, so the next day guides
        const days = !!args.is_own_reference ? sameDay : nextDay;

        return cbk(null, dates.reduce((sum, date) => {
          sum[date] = addDays({days, day: date}).day;

          return sum;
        },
        {}));
      }],

      // Derive the prices, keeping the estimates only in memory
      derive: ['getHeight', 'guides', ({getHeight, guides}, cbk) => {
        const estimates = {priors: {}, provisional: {}, rates: {}};
        const records = [];
        const references = {};
        const times = new Map();

        // A day that cannot be priced is not estimated again in the run
        const unsupported = new Map();

        // Log the progress of the derivation
        const log = record => {
          // Exit early when there is no logger
          if (!logger) {
            return;
          }

          const samples = records.filter(n => !!n.is_sample).length;

          // Exit early when a bridging estimate is not due to be logged
          if (!!record.is_sample && !!(samples % sampleLogInterval)) {
            return;
          }

          // A full day price estimated without a guide is a starting point
          if (!!record.is_unguided) {
            logger.info({chain_price: {starting_from: record.date}});
          }

          return logger.info({
            chain_price: {
              date: record.date,
              is_provisional: record.is_provisional,
              is_sample: record.is_sample,
              payments: !record.is_sample ? record.payments : undefined,
              price: dollars(record.cents),
            },
          });
        };

        // Compare a derived price against the reference for its date
        const compare = ({date, derived, guide}) => compareToReference({
          date,
          derived,
          guide,
          logger,
          lookup: references[date],
        })
        .comparison;

        // Estimate a date from the blocks of its own day
        const estimate = ({date, guide}, cbk) => {
          return estimateOwnDay({
            date,
            guide,
            lnd,
            logger,
            times,
            height: getHeight.current_block_height,
            is_capping_near_round: args.is_capping_near_round,
            is_sampled: args.is_sampled,
          },
          (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            if (!!res.record) {
              records.push(res.record);
            }

            return cbk(null, compare({date, guide, derived: res.derived}));
          });
        };

        // Derive the price of a date and compare it with its reference price
        const compareDate = (date, cbk) => {
          const guideDay = guides[date];

          // Exit early when there is no reference price to compare against
          if (!!references[date].err) {
            return cbk(null, compare({date}));
          }

          // Exit early when there is no reference price to guide the search
          if (!!guideDay && !!references[guideDay].err) {
            const {err} = references[guideDay];

            const error = [503, 'FailedToGetGuidePriceForDay', {
              err,
              day: guideDay,
            }];

            return cbk(null, compare({date, derived: {error}}));
          }

          if (!!logger) {
            logger.info({deriving_price_for: date});
          }

          // Exit early when the search is guided by a reference price
          if (!!guideDay) {
            const {cents} = references[guideDay].reference;

            return estimate({date, guide: {cents, day: guideDay}}, cbk);
          }

          // Exit early when each date stands on its own
          if (!!args.is_unguided) {
            return estimate({date}, cbk);
          }

          return getPriceForDate({
            date,
            lnd,
            logger,
            unsupported,
            get_prices: ({}, cbk) => cbk(null, estimates),
            height: getHeight.current_block_height,
            put_price: (record, cbk) => {
              log(record);

              records.push(record);

              rememberEstimate({estimates, estimate: record});

              return cbk();
            },
          },
          (err, res) => {
            // A date that cannot be priced is reported, not fatal
            if (!!err) {
              return cbk(null, compare({date, derived: {error: err}}));
            }

            return cbk(null, compare({
              date,
              derived: {cents: res.cents, is_supported: true},
            }));
          });
        };

        return asyncMapSeries(dates, (date, cbk) => {
          // Reference prices are fetched as each date comes up
          const needed = new Set([date, guides[date]].filter(n => !!n));

          const days = [...needed].filter(n => !references[n]);

          return getReferencePrices({days, logger, request}, (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            assign(references, res.references);

            return compareDate(date, cbk);
          });
        },
        (err, comparisons) => cbk(err, {comparisons, records}));
      }],

      // Final result
      result: ['derive', ({derive}, cbk) => {
        return cbk(null, {
          comparisons: derive.comparisons,
          records: derive.records,
        });
      }],
    },
    returnResult({reject, resolve, of: 'result'}, cbk));
  });
};
