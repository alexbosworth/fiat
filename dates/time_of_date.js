const {dayLength} = require('./constants');

const clockFormat = /^((?:[01]\d|2[0-3]):\d{2}(?::\d{2}(?:\.\d+)?)?)(.*)$/;
const dateFormat = /^(\d{4}-\d{2}-\d{2})(?:[Tt ](.*))?$/;
const isoDay = time => new Date(time).toISOString().slice(Number(), dayLength);
const {isInteger} = Number;
const offsetFormat = /^(?:[Zz]|[+-]\d{2}:?\d{2})?$/;

/** Get the time of an ISO 8601 date

  {
    date: <ISO 8601 Date String>
  }

  @returns
  {
    [time]: <Epoch Time Milliseconds Number>
  }
*/
module.exports = ({date}) => {
  // Exit early when there is no date to read
  if (typeof date !== 'string') {
    return {};
  }

  const [, day, rest] = dateFormat.exec(date) || [];

  // Exit early when the date does not start with a day
  if (!day) {
    return {};
  }

  const start = Date.parse(`${day}T00:00:00.000Z`);

  // Exit early when the day is not a day of the calendar
  if (!isInteger(start) || isoDay(start) !== day) {
    return {};
  }

  // Exit early when the date is only a day
  if (rest === undefined) {
    return {time: start};
  }

  const [, clock, offset] = clockFormat.exec(rest) || [];

  // Exit early when the time of day or its offset is not written as one
  if (!clock || !offsetFormat.test(offset)) {
    return {};
  }

  // A time without an offset is in UTC, so it is the same on every machine
  const time = Date.parse(`${day}T${clock}${(offset || 'Z').toUpperCase()}`);

  // Exit early when the time of day or the offset is not a real one
  if (!isInteger(time)) {
    return {};
  }

  return {time};
};
