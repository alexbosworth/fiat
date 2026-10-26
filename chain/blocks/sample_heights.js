const {floor} = Math;
const range = n => [...Array(n).keys()];

/** Pick evenly spaced heights to get a quick sample of a range of blocks

  {
    count: <Sample Blocks Count Number>
    heights: [<Block Height Number>]
    [initial]: <Blocks In the First Sample Count Number>
  }

  @returns
  {
    heights: [<Sampled Block Height Number>]
  }
*/
module.exports = ({count, heights, initial}) => {
  // Exit early when there are not more blocks than the sample size
  if (heights.length <= count) {
    return {heights};
  }

  // A doubled sample takes the start of each stretch to keep the first one
  const isDoubled = !!initial && count > initial;

  // Positions are counted in half stretches so that every sample of a range
  // maps them to the same heights
  const halves = range(count).map(i => isDoubled ? 2 * i : 2 * i + 1);

  const indices = halves.map(n => floor(n * heights.length / (2 * count)));

  return {heights: indices.map(index => heights[index])};
};
