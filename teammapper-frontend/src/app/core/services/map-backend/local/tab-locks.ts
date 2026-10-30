/** False in a browser without the Web Locks API, such as over plain http. */
const hasLocks = (): boolean => 'locks' in navigator;

/**
 * Runs the task while no other tab of the site runs one under the same
 * name. A browser without the Web Locks API runs it at once.
 */
export async function withLock(
  name: string,
  task: () => Promise<void>
): Promise<void> {
  if (!hasLocks()) return task();
  await navigator.locks.request(name, task);
}
