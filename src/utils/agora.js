const { RtcTokenBuilder, RtcRole } = require('agora-token');

/**
 * Generate an Agora RTC Token for a specific channel and user.
 * @param {string} channelName - The name of the channel (booking ID or custom string).
 * @param {string} uid - The unique user ID (must be a number for Agora RTC, or 0 for any).
 * @param {number} expireTimeInSeconds - Token expiration time.
 * @returns {string} - The generated token.
 */
const generateRtcToken = (channelName, uid = 0, expireTimeInSeconds = 3600) => {
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
        console.warn('[AGORA] App ID or Certificate missing in .env. Voice calls will fail.');
        return null;
    }

    const role = RtcRole.PUBLISHER;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expireTimeInSeconds;

    // Use 0 for uid to allow any numeric UID if needed, 
    // but Agora usually prefers numeric UIDs. 
    // We'll pass 0 and let the client handle its own numeric UID assignment.
    return RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uid,
        role,
        privilegeExpiredTs
    );
};

module.exports = {
    generateRtcToken
};
