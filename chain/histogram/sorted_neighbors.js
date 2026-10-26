const lowerBound = require('./lower_bound');

const {abs} = Math;
const {max} = Math;
const {min} = Math;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);

/** Get a value from the sorted shares of the neighbors of each bin

  {
    bins: [<Share Number>]
    exclude: <Bins Next to a Bin to Leave Out of Its Neighbors Number>
    min_bin: <Lowest Bin That Can Be a Neighbor Number>
    radius: <Bins On Either Side to Take Neighbors From Number>
    value: <Value From Sorted Neighbor Shares Function> (sorted) => <Value>
  }

  @returns
  {
    values: [<Value From the Sorted Shares of the Neighbors of the Bin>]
  }
*/
module.exports = args => {
  const {bins, exclude, radius, value} = args;

  const first = max(Number(), args.min_bin);

  // The shares of the neighbors of a bin, kept in order from bin to bin
  const sorted = [];

  // Moving on to a bin only changes the bins at the edges of its reach and at
  // the edges of the bins left out around it
  const edges = [-1 - radius, -1 - exclude, exclude, radius]
    .filter((offset, i, offsets) => offsets.indexOf(offset) === i);

  // A neighbor of a bin is within its reach and beyond the bins left out
  const isNeighbor = (index, bin) => {
    const distance = abs(index - bin);

    const isBin = index >= first && index < bins.length;

    return isBin && distance > exclude && distance <= radius;
  };

  // Put the share of a bin in its place among the sorted shares
  const add = index => {
    const at = lowerBound({sorted, value: bins[index]}).index;

    return sorted.splice(at, Number(), bins[index]);
  };

  // Take the share of a bin out of the sorted shares
  const drop = index => {
    const at = lowerBound({sorted, value: bins[index]}).index;

    return sorted.splice(at, 1);
  };

  // Move the neighbors on from the bin before a bin to the bin
  const step = bin => {
    return edges.map(offset => bin + offset).forEach(index => {
      const isNeighborNow = isNeighbor(index, bin);
      const wasNeighbor = isNeighbor(index, bin - 1);

      // Exit early when the bin is still a neighbor, or still is not one
      if (isNeighborNow === wasNeighbor) {
        return;
      }

      return isNeighborNow ? add(index) : drop(index);
    });
  };

  // The first bin starts out with all of its neighbors
  range(Number(), min(bins.length, radius + 1))
    .filter(index => isNeighbor(index, Number()))
    .forEach(add);

  const values = bins.map((share, bin) => {
    // A bin after the first moves the neighbors on from the bin before it
    if (!!bin) {
      step(bin);
    }

    return value(sorted);
  });

  return {values};
};
