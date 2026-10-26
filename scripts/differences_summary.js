const medianOf = require('./median_of');
const {sortBy} = require('./../arrays');

const {abs} = Math;
const {ceil} = Math;
const largestCount = 5;
const percentile = 0.95;
const signed = n => `${n < 0 ? '' : '+'}${(n * 100).toFixed(2)}%`;
const size = n => `${(n * 100).toFixed(2)}%`;

/** Summarize how far the prices of days are from other prices of the days

  {
    differences: [{
      day: <Day YYYY-MM-DD String>
      difference: <Price Over Other Price Less One Number>
    }]
  }

  @returns
  {
    [bias]: <Median Difference Number>
    changed: <Days With Any Difference Count Number>
    count: <Days Compared Count Number>
    description: <Summary of the Differences String>
    largest: [{
      day: <Day YYYY-MM-DD String>
      difference: <Price Over Other Price Less One Number>
    }]
    [median]: <Median Size of the Differences Number>
    [percentile]: <95th Percentile Size of the Differences Number>
  }
*/
module.exports = ({differences}) => {
  // Exit early when there are no differences to summarize
  if (!differences.length) {
    return {changed: 0, count: 0, description: 'no days', largest: []};
  }

  const sized = differences.map(({day, difference}) => {
    return {day, difference, size: abs(difference)};
  });

  const {sorted} = sortBy({array: sized, attribute: 'size'});

  const sizes = sorted.map(n => n.size);

  const bias = medianOf({numbers: differences.map(n => n.difference)}).median;
  const largest = sorted.filter(n => !!n.size).slice(-largestCount).reverse();
  const median = medianOf({numbers: sizes}).median;
  const percentileSize = sizes[ceil(percentile * sizes.length) - 1];

  const listed = largest.map(n => `${n.day} ${signed(n.difference)}`);

  const description = [
    `median ${size(median)}`,
    `95% within ${size(percentileSize)}`,
    `bias ${signed(bias)}`,
  ]
  .concat(!listed.length ? [] : `largest ${listed.join(', ')}`);

  return {
    bias,
    median,
    changed: differences.filter(n => !!n.difference).length,
    count: differences.length,
    description: description.join(', '),
    largest: largest.map(({day, difference}) => ({day, difference})),
    percentile: percentileSize,
  };
};
