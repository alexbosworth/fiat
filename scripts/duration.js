const {floor} = Math;
const minutesPerHour = 60;
const msPerMinute = 1000 * 60;
const {round} = Math;

/** Describe a duration in hours and minutes

  {
    ms: <Duration Milliseconds Number>
  }

  @returns
  {
    duration: <Hours and Minutes String>
  }
*/
module.exports = ({ms}) => {
  const minutes = round(ms / msPerMinute);

  const hours = floor(minutes / minutesPerHour);

  const remainder = minutes % minutesPerHour;

  return {duration: !hours ? `${minutes}m` : `${hours}h ${remainder}m`};
};
