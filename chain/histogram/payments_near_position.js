const {max} = Math;
const {min} = Math;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);

/** Count the implied prices above the background around a position

  {
    background: [<Background Count In Bin Number>]
    counts: [<Implied Prices In Bin Count Number>]
    kernel: <Smoothing Kernel Half Width in Bins Number>
    position: <Bin Index Number>
  }

  @returns
  {
    above: <Counts Above the Background Number>
    observed: <Counts Observed Number>
  }
*/
module.exports = ({background, counts, kernel, position}) => {
  const start = max(Number(), position - kernel);
  const end = min(counts.length, position + kernel + 1);

  return range(start, end).reduce((sum, bin) => {
    return {
      above: sum.above + counts[bin] - background[bin],
      observed: sum.observed + counts[bin],
    };
  },
  {above: Number(), observed: Number()});
};
