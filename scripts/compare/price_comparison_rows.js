const {centsPerDollar} = require('./../../chain/constants');
const priceSupport = require('./price_support');

const asPercent = n => `${(n * 100).toFixed(2)}%`;
const dollars = cents => (cents / centsPerDollar).toFixed(2);
const providerNames = {coinbase: 'Coinbase', coingecko: 'CoinGecko'};
const rounded = n => Math.round(n * 1000) / 1000;
const sourceName = source => providerNames[source] || source;
const yesOrNo = isYes => !!isYes ? 'yes' : 'no';

/** Get table rows for comparisons of chain prices with reference prices

  {
    comparisons: [{
      [cents]: <Derived USD Cents Per BTC Number>
      [close_cents]: <Day Last Trade or Next Day Start USD Cents Number>
      date: <Day YYYY-MM-DD String>
      [difference]: <Derived Price Over Reference Price Minus One Number>
      [error]: <Derivation or Reference Error Array>
      [guide_cents]: <Reference USD Cents Per BTC Guiding the Search Number>
      [is_conflict]: <Supported Price Is At An Alias Ratio of Its Guide Bool>
      [is_supported]: <Derived Price Is Supported By the Data Bool>
      [is_widened]: <Search Was Widened Beyond the Guide Window Bool>
      [open_cents]: <Day First Trade or Start USD Cents Number>
      [reference_cents]: <Reference USD Cents Per BTC Number>
      [sample_blocks]: <Blocks In the Sample Count Number>
      [source]: <Reference Price Provider Name String>
      [windows]: [{
        is_supported: <Window Price Is Supported By the Data Bool>
        [is_widened]: <Search Was Widened Beyond the Price Window Bool>
      }]
    }]
    [is_reference_guided]: <Dates Were Searched In a Reference Window Bool>
    [is_sampled]: <Dates Were Estimated From Samples of Their Blocks Bool>
    [is_unguided]: <Dates Were Estimated From Their Own Blocks Alone Bool>
    records: [{
      [confidence]: <Best Position Score Over Best Alias Score Number>
      date: <Day YYYY-MM-DD String>
      [dispersion]: <Peak Width Beyond Smoothing As Price Fraction Number>
      [is_sample]: <Price Is A Rough Estimate From Sample Blocks Bool>
      [payments]: <Estimated Round USD Payments Count Number>
      [rivalry]: <Best Patterned Rival Position Score Over Best Score Number>
      [stability]: <Largest Price Change From Perturbed Refinement Number>
    }]
  }

  @returns
  {
    rows: [[<Column String>]]
    rows_summary: [[<Column String>]]
  }
*/
module.exports = args => {
  const isGuided = !!args.is_reference_guided;

  // Support is shown when each date was estimated from its own blocks
  const isSupportShown = isGuided || !!args.is_unguided;

  const header = [
    'Date',
    'Chain Price',
    'Reference',
    !isGuided ? undefined : 'Guide',
    'Day Move',
    'Source',
    'Difference',
    !isSupportShown ? undefined : 'Supported',
    !isGuided ? undefined : 'Widened',
    !args.is_sampled ? undefined : 'Blocks',
    'Payments',
    'Confidence',
    'Rivalry',
    'Dispersion',
    'Stability',
  ]
  .filter(n => n !== undefined);

  // Every row needs the same number of cells to render as a table
  const padded = cells => {
    return header.map((n, i) => cells[i] === undefined ? ' ' : cells[i]);
  };

  const rows = args.comparisons.map(comparison => {
    const {date} = comparison;

    const record = args.records.find(n => {
      // A sampled date is only estimated from a sample of its blocks
      if (!!args.is_sampled) {
        return n.date === date;
      }

      return n.date === date && !n.is_sample;
    }) || {};

    // Exit early when the price could not be derived or compared
    if (!!comparison.error) {
      const [, message] = comparison.error;
      const reference = comparison.reference_cents;

      const shown = !reference ? ' ' : dollars(reference);

      return padded([date, message, shown]);
    }

    return padded([
      date,
      dollars(comparison.cents),
      dollars(comparison.reference_cents),
      !isGuided ? undefined : dollars(comparison.guide_cents),
      asPercent(comparison.close_cents / comparison.open_cents - 1),
      sourceName(comparison.source),
      asPercent(comparison.difference),
      !isSupportShown ? undefined : priceSupport(comparison).support,
      !isGuided ? undefined : yesOrNo(comparison.is_widened),
      !args.is_sampled ? undefined : String(comparison.sample_blocks),
      String(record.payments),
      String(rounded(record.confidence)),
      String(rounded(record.rivalry)),
      String(rounded(record.dispersion)),
      String(rounded(record.stability)),
    ]
    .filter(n => n !== undefined));
  });

  const compared = args.comparisons.filter(n => !n.error);

  const conflicts = compared.filter(n => !!n.is_conflict);

  // A price in conflict with its guide would be refused however supported
  const supported = compared.filter(n => !!n.is_supported && !n.is_conflict);

  const widened = compared.filter(n => !!n.is_widened);

  const largest = compared.reduce((max, n) => {
    return Math.max(max, Math.abs(n.difference));
  },
  Number());

  const largestSupported = supported.reduce((max, n) => {
    return Math.max(max, Math.abs(n.difference));
  },
  Number());

  const summary = [
    ['Compared', String(compared.length)],
    ['Failed', String(args.comparisons.length - compared.length)],
    ['Largest Difference', !compared.length ? ' ' : asPercent(largest)],
  ];

  // Estimating each date from its own blocks also shows how support did
  if (isSupportShown) {
    summary.push(['Supported', String(supported.length)]);

    summary.push([
      'Largest Supported Difference',
      !supported.length ? ' ' : asPercent(largestSupported),
    ]);
  }

  const windowed = supported.filter(n => !!n.windows);

  // Dates priced from their windows are counted when there are any
  if (!!windowed.length) {
    summary.push(['Priced From Windows', String(windowed.length)]);
  }

  // A guided search also shows how often the price was outside the window
  if (isGuided) {
    summary.push(['Widened', String(widened.length)]);

    summary.push(['Conflicts', String(conflicts.length)]);
  }

  return {
    rows: [].concat([header]).concat(rows),
    rows_summary: [summary.map(([n]) => n), summary.map(([, n]) => n)],
  };
};
