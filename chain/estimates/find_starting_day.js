const asyncAuto = require('async/auto');
const asyncTimesSeries = require('async/timesSeries');
const {returnResult} = require('asyncjs-util');

const addDays = require('./../add_days');

const maxStartDays = 7;

/** Find a starting day whose price its own blocks clearly identify

  {
    estimate: <Estimate Day Price Function> ({
      day: <Day YYYY-MM-DD String>
      is_sample: <Estimate From a Sample of Blocks Bool>
      is_unguided: <Estimate Without a Neighboring Guide Bool>
    }, cbk) => (err, {is_supported: <Price Is Supported Bool>})
    latest: <Latest Complete Day YYYY-MM-DD String>
    [logger]: <Winston Logger Object>
  }

  @returns via cbk or Promise
  {
    day: <Supported Starting Day YYYY-MM-DD String>
  }
*/
module.exports = ({estimate, latest, logger}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Try the latest complete day, then the days before it
      findStart: cbk => {
        const start = {};
        const tried = [];

        return asyncTimesSeries(maxStartDays, (i, cbk) => {
          // Exit early when a supported starting day was already found
          if (!!start.day) {
            return cbk();
          }

          const {day} = addDays({day: latest, days: -i});

          tried.push(day);

          return estimate({
            day,
            is_sample: false,
            is_unguided: true,
          },
          (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            // Exit early when the day clearly identifies its price
            if (!!res.is_supported) {
              start.day = day;

              return cbk();
            }

            if (!!logger) {
              logger.info({unsupported_starting_day: day});
            }

            return cbk();
          });
        },
        err => {
          if (!!err) {
            return cbk(err);
          }

          // Exit early when no starting price is clearly identified
          if (!start.day) {
            return cbk([503, 'FailedToFindSupportedStartingPrice', {
              days: tried,
            }]);
          }

          return cbk(null, {day: start.day});
        });
      },
    },
    returnResult({reject, resolve, of: 'findStart'}, cbk));
  });
};
