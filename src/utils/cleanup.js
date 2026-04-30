const prisma = require('../db');

/**
 * Cleanup Task
 * Deletes old notifications to keep the database size manageable.
 */
const startCleanupTask = () => {
    console.log('🧹 [Cleanup] Automatic Data Retention task initialized (24h interval)');

    // Run immediately on boot
    runCleanup();

    // Then run every 24 hours
    setInterval(() => {
        runCleanup();
    }, 24 * 60 * 60 * 1000);
};

const runCleanup = async () => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        console.log(`🚀 [Cleanup] Starting purge of notifications older than: ${thirtyDaysAgo.toISOString()}`);

        const deleted = await prisma.notification.deleteMany({
            where: {
                createdAt: {
                    lt: thirtyDaysAgo
                }
            }
        });

        if (deleted.count > 0) {
            console.log(`✅ [Cleanup] Successfully purged ${deleted.count} old notifications.`);
        } else {
            console.log('✅ [Cleanup] No old notifications to purge.');
        }

    } catch (err) {
        console.error('❌ [Cleanup] Retention task failed:', err.message);
    }
};

module.exports = { startCleanupTask };
