/** Whether the PWA can schedule OS notifications via the service worker (Chrome-only today). */
export function supportsPwaOsSchedule(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return false;
  return 'showTrigger' in Notification.prototype;
}
