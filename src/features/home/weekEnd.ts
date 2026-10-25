/** Friday, Saturday and Sunday in the user's local time: when a weekly retrospective makes sense. */
export function isWeekEnd(date: Date): boolean {
  const day = date.getDay();
  return day === 5 || day === 6 || day === 0;
}
