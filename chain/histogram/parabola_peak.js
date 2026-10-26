const {half} = require('./../constants');

const twice = 2;

/** Find the peak of a parabola fit through three evenly spaced points

  {
    above: <Value After Center Number>
    below: <Value Before Center Number>
    center: <Center Value Number>
  }

  @returns
  {
    delta: <Peak Offset From Center In Units of Point Spacing Number>
  }
*/
module.exports = ({above, below, center}) => {
  const curvature = below - twice * center + above;

  // Exit early when the points do not form a peak
  if (curvature >= 0) {
    return {delta: 0};
  }

  // A negative zero is normalized to zero
  return {delta: half * (below - above) / curvature || 0};
};
