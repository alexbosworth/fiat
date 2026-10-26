const dotProduct = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], Number());
const magnitude = arr => Math.sqrt(arr.reduce((sum, n) => sum + n * n, 0));

/** Measure how well measured spike strengths agree with the template weights

  {
    strengths: [<Spike Strength Number>]
    weights: [<Template Weight Number>]
  }

  @returns
  {
    agreement: <Cosine Similarity Number>
  }
*/
module.exports = ({strengths, weights}) => {
  const dot = dotProduct(strengths, weights);
  const strengthsNorm = magnitude(strengths);
  const weightsNorm = magnitude(weights);

  // Exit early when there are no spikes to compare
  if (!strengthsNorm || !weightsNorm) {
    return {agreement: Number()};
  }

  return {agreement: dot / (strengthsNorm * weightsNorm)};
};
