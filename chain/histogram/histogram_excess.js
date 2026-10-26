const sortedNeighbors = require('./sorted_neighbors');

const defaultExclude = 2;
const defaultRadius = 12;
const {isArray} = Array;
const {max} = Math;

/** Get the excess of each histogram bin over its local background

  {
    bins: [<Share of Outputs in Bin Number>]
    [exclude]: <Bins Next to the Bin to Leave Out of the Background Number>
    [radius]: <Bins On Either Side to Take the Background From Number>
  }

  @throws
  <Error>

  @returns
  {
    background: [<Local Background Share Number>]
    excess: [<Share of Outputs Above Local Background Number>]
  }
*/
module.exports = ({bins, exclude, radius}) => {
  if (!isArray(bins)) {
    throw new Error('ExpectedHistogramBinsToCalculateHistogramExcess');
  }

  const {values} = sortedNeighbors({
    bins,
    exclude: exclude === undefined ? defaultExclude : exclude,
    min_bin: Number(),
    radius: radius === undefined ? defaultRadius : radius,
    value: sorted => {
      // Exit early when there is no background to compare against
      if (!sorted.length) {
        return Number();
      }

      // The median neighbor, rounded down to the lower middle of an even count
      return sorted[(sorted.length - 1) >>> 1];
    },
  });

  return {
    background: values,
    excess: bins.map((share, bin) => max(0, share - values[bin])),
  };
};
