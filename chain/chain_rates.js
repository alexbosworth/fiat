const asyncQueue = require('async/queue');

const {dayOfDate} = require('./../dates');
const {earliestSupportedDay} = require('./known');
const {fsMethods} = require('./../storage/constants');
const {getChainPrice} = require('./estimates');
const {knownPrices} = require('./known');

const supportedCurrency = 'BTC';
const supportedFiat = 'USD';

/** Make a method that gets historic USD prices of BTC from chain data

  {
    fs: {
      getFile: <Read File Contents Function> (path, cbk) => {}
      makeDirectory: <Make Directory Function> (path, cbk) => {}
      renameFile: <Rename File Function> (from, to, cbk) => {}
      writeFile: <Write File Contents Function> (path, contents, cbk) => {}
    }
    lnd: <Authenticated LND API Object>
    [logger]: <Winston Logger Object>
    path: <Prices File Path String>
  }

  @throws
  <Error>

  @returns
  {
    getChainRate: <Get Chain Rate Method> ({
      currency: <Currency To Price String> // BTC
      date: <Date To Price ISO 8601 Date String> // priced on its day in UTC
      fiat: <Fiat Currency To Price In String> // USD
    }, cbk) => (err, {
      cents: <US Cents Per BTC on the Day of the Date Number>
    })
  }
*/
module.exports = ({fs, lnd, logger, path}) => {
  if (!fs || !fsMethods.every(method => typeof fs[method] === 'function')) {
    throw new Error('ExpectedFileSystemMethodsToMakeChainRates');
  }

  if (!lnd) {
    throw new Error('ExpectedAuthenticatedLndToMakeChainRates');
  }

  if (!path) {
    throw new Error('ExpectedPricesFilePathToMakeChainRates');
  }

  const estimates = {provisional: {}, samples: Number()};

  // A day the data cannot price is not derived again by this method
  const unsupported = new Map();

  // Lookups are serialized so that each estimate can guide the next one
  const queue = asyncQueue(({date}, cbk) => {
    // The shipped prices are read the first time a price is looked up
    const shipped = (() => {
      try {
        return {rates: knownPrices({}).rates};
      } catch (err) {
        return {err};
      }
    })();

    // Exit early when the shipped prices cannot be read
    if (!!shipped.err) {
      return cbk([503, 'FailedToReadKnownPricesToGetChainRate', {
        err: shipped.err,
      }]);
    }

    return getChainPrice({
      date,
      estimates,
      fs,
      lnd,
      logger,
      path,
      unsupported,
      known: shipped.rates,
    },
    cbk);
  });

  const getChainRate = ({currency, date, fiat}, cbk) => {
    if (currency !== supportedCurrency) {
      return cbk([400, 'UnsupportedCurrencyToGetChainRate']);
    }

    if (!date || typeof date !== 'string') {
      return cbk([400, 'ExpectedDateToGetChainRate']);
    }

    if (fiat !== supportedFiat) {
      return cbk([400, 'UnsupportedFiatToGetChainRate']);
    }

    // A date is priced on its day in UTC
    const {day} = dayOfDate({date});

    // Exit early when the date is not a readable date on a calendar day
    if (!day) {
      return cbk([400, 'ExpectedValidDateToGetChainRate']);
    }

    const earliest = earliestSupportedDay({}).day;

    // Exit early when the date is before the days prices are derived for
    if (day < earliest) {
      return cbk([400, 'DateBeforeSupportedRangeToGetChainRate', {
        earliest_day: earliest,
      }]);
    }

    return queue.push({date: day}, (err, res) => {
      if (!!err) {
        return cbk(err);
      }

      return cbk(null, {cents: res.cents});
    });
  };

  return {getChainRate};
};
