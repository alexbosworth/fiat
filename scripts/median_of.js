const {floor} = Math;

/** Get the middle value of some numbers

  {
    numbers: [<Number>]
  }

  @returns
  {
    median: <Middle Value Number>
  }
*/
module.exports = ({numbers}) => {
  const sorted = numbers.slice().sort((a, b) => a - b);

  const middle = floor(sorted.length / 2);

  // An even count has two middle values
  if (!(sorted.length % 2)) {
    return {median: (sorted[middle - 1] + sorted[middle]) / 2};
  }

  return {median: sorted[middle]};
};
