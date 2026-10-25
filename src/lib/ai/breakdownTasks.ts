/**
 * New tasks are added to the TOP of a list, so adding the steps one by one in their own order
 * would show them reversed. Adding them last-to-first leaves them in the order of the steps.
 */
export function stepsForTopInsert<T>(steps: readonly T[]): T[] {
  return [...steps].reverse();
}
