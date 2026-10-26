/** Find the first index in a sorted array that is not less than a value

  {
    sorted: [<Sorted Number>]
    value: <Value Number>
  }

  @returns
  {
    index: <Index of First Element Not Less Than Value Number>
  }
*/
module.exports = ({sorted, value}) => {
  const bounds = {high: sorted.length, low: Number()};

  // Halve the range until it has narrowed to a single index
  while (bounds.low < bounds.high) {
    const mid = (bounds.low + bounds.high) >>> 1;

    if (sorted[mid] < value) {
      bounds.low = mid + 1;
    } else {
      bounds.high = mid;
    }
  }

  return {index: bounds.low};
};
