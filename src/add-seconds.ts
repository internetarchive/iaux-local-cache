import { Seconds } from './models';

/**
 * Add seconds to a given date
 *
 * @export
 * @param {Date} date
 * @param {Seconds} seconds
 * @returns
 */
export function addSeconds(date: Date, seconds: Seconds) {
  // we're adding seconds, but want millisecond accuracy so use milliseconds
  date.setMilliseconds(date.getMilliseconds() + seconds * 1000);
  return date;
}
