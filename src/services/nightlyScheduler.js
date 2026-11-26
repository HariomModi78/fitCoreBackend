import Gym from '../models/Gym.js';
import { runExpiryScan } from '../controllers/notification.controller.js';

/**
 * Nightly Automated Scanner Service
 *
 * Runs automatically every night when the server is idle (default: 02:00 AM IST).
 * Loops through all active gyms to:
 * 1. Scan and generate pending Due Reminders for members whose scheduled dueReminderDate has arrived.
 * 2. Scan and generate Expiry Alerts for members whose plans expire today or within configured threshold.
 * 3. Pre-generate personalized WhatsApp message links ready for one-click dispatch.
 */
export const runSystemWideNightlyScan = async () => {
  try {
    console.log('🌙 [Nightly Scheduler]: Starting automated due & expiry scan for all active gyms...');

    const activeGyms = await Gym.find({
      saasStatus: { $ne: 'suspended' },
    });

    let totalChecked = 0;
    let totalCreated = 0;

    for (const gym of activeGyms) {
      try {
        const result = await runExpiryScan(gym._id);
        totalChecked += result.checked || 0;
        totalCreated += result.created || 0;
      } catch (err) {
        console.error(`❌ [Nightly Scheduler]: Error scanning gym "${gym.name}" (${gym._id}):`, err.message);
      }
    }

    console.log(
      `✅ [Nightly Scheduler Complete]: Checked ${totalChecked} subscriptions, generated ${totalCreated} new alerts across ${activeGyms.length} gyms.`
    );
    return { gymsCount: activeGyms.length, totalChecked, totalCreated };
  } catch (error) {
    console.error('❌ [Nightly Scheduler Error]:', error);
  }
};

/**
 * Initializes the automated nightly scheduler
 *
 * Runs at the specified hour (default: 02:00 AM) every 24 hours.
 * Uses zero external dependencies for maximum reliability.
 *
 * @param {number} targetHour - 24-hour format (default 2 for 02:00 AM)
 * @param {number} targetMinute - Minute (default 0)
 */
export const initNightlyScheduler = (targetHour = 2, targetMinute = 0) => {
  const scheduleNextRun = () => {
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(targetHour, targetMinute, 0, 0);

    // If target time has already passed today, schedule for tomorrow
    if (now >= nextRun) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delayMs = nextRun.getTime() - now.getTime();
    const hoursRemaining = (delayMs / (1000 * 60 * 60)).toFixed(2);

    console.log(
      `🌙 [Nightly Scheduler Active]: Next automated reminder scan scheduled in ${hoursRemaining}h at ${nextRun.toLocaleTimeString('en-IN')}`
    );

    setTimeout(async () => {
      try {
        await runSystemWideNightlyScan();
      } catch (err) {
        console.error('❌ [Nightly Scheduler Execution Error]:', err);
      } finally {
        scheduleNextRun(); // Always re-arm the timer for the subsequent night
      }
    }, delayMs);
  };

  scheduleNextRun();
};

export default initNightlyScheduler;
