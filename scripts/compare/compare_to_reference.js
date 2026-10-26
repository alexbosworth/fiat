const {centsPerDollar} = require('./../../chain/constants');
const windowsSummary = require('./windows_summary');

const asPercent = n => `${(n * 100).toFixed(2)}%`;
const dollars = cents => (cents / centsPerDollar).toFixed(2);
const rounded = n => Math.round(n * 1e6) / 1e6;

/** Compare a derived price against the reference price for its date

  {
    date: <Day YYYY-MM-DD String>
    [derived]: {
      [cents]: <Derived USD Cents Per BTC Number>
      [error]: <Derivation Error Array>
      [is_conflict]: <Supported Price Is At An Alias Ratio of Its Guide Bool>
      [is_supported]: <Derived Price Is Supported By the Data Bool>
      [is_widened]: <Search Was Widened Beyond the Guide Window Bool>
      [payments]: <Estimated Round USD Payments Count Number>
      [sample_blocks]: <Blocks In the Sample Count Number>
      [windows]: [<Window Estimate Object>]
    }
    [guide]: {
      cents: <Reference USD Cents Per BTC Guiding the Search Number>
      day: <Day of the Guiding Reference Price YYYY-MM-DD String>
    }
    [logger]: <Winston Logger Object>
    lookup: {
      [err]: <Reference Price Error Array>
      [reference]: <Reference Price Object>
    }
  }

  @returns
  {
    comparison: <Comparison Object>
  }
*/
module.exports = ({date, derived, guide, logger, lookup}) => {
  const {err, reference} = lookup;

  // Exit early when there is no reference for the date
  if (!!err) {
    const error = [503, 'FailedToGetReferencePriceForDay', {err, day: date}];

    if (!!logger) {
      logger.info({compared: {date, error}});
    }

    return {comparison: {date, error}};
  }

  const difference = rounded(derived.cents / reference.cents - 1);

  if (!!logger && !!derived.error) {
    logger.info({compared: {date, error: derived.error}});
  }

  if (!!logger && !derived.error) {
    logger.info({
      compared: {
        date,
        chain_price: !derived.cents ? undefined : dollars(derived.cents),
        difference: !derived.cents ? undefined : asPercent(difference),
        guide_price: !guide ? undefined : dollars(guide.cents),
        is_conflict: derived.is_conflict,
        is_unsupported: derived.is_supported === false || undefined,
        is_widened: derived.is_widened,
        payments: derived.payments,
        reference_price: dollars(reference.cents),
        sample_blocks: derived.sample_blocks,
        windows: windowsSummary({windows: derived.windows}).summary,
      },
    });
  }

  return {
    comparison: {
      date,
      cents: derived.cents,
      close_cents: reference.close_cents,
      difference: !derived.cents ? undefined : difference,
      error: derived.error,
      guide_cents: !guide ? undefined : guide.cents,
      guide_date: !guide ? undefined : guide.day,
      is_conflict: derived.is_conflict,
      is_supported: derived.is_supported,
      is_widened: derived.is_widened,
      open_cents: reference.open_cents,
      reference_cents: reference.cents,
      sample_blocks: derived.sample_blocks,
      source: reference.source,
      vwap_cents: reference.vwap_cents,
      windows: derived.windows,
    },
  };
};
