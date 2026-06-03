/**
 * @typedef {'todo' | 'team-item'} ReminderSource
 *
 * @typedef {Object} ReminderSlot
 * @property {string} slotKey
 * @property {string} itemId
 * @property {ReminderSource} source
 * @property {string} remindAt
 * @property {string} title
 * @property {string} body
 * @property {'daily' | 'weekly' | 'monthly'} [repeat]
 * @property {string | null} [deepLinkPath]
 *
 * @typedef {Object} ReminderSyncStatus
 * @property {boolean} osScheduling
 * @property {string} platform
 * @property {number} pendingInApp
 * @property {number} pendingOs
 * @property {string|null} osError
 * @property {boolean} [backgroundMode]
 * @property {boolean} [launchAtLogin]
 * @property {boolean} [hideToTrayOnClose]
 */
// @ts-nocheck


module.exports = {};
