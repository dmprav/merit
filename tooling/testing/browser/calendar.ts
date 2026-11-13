/**
 * Matches a calendar day button's accessible name, written as "Thursday, 21 January 2027".
 *
 * Calendar cells are named by the browser's Intl date formatting, so the punctuation
 * follows the engine's CLDR data: newer data puts a comma after the British weekday,
 * while WebKit on Linux uses the system ICU, which omits it. Both are correct for their
 * data, so the matcher accepts either while still requiring the exact weekday and date.
 */
export const calendarDay = (name: string) => {
  const match = /^(\w+), (\d{1,2} \w+ \d{4})$/.exec(name);
  if (!match) {
    throw new Error(`Expected a day such as "Thursday, 21 January 2027", received "${name}".`);
  }
  return new RegExp(`\\b${match[1]},? ${match[2]}\\b`);
};
