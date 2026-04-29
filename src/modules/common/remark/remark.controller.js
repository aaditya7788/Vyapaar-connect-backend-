const remarkService = require('./remark.service');
const { sendEmail } = require('../../../utils/mail');
const env = require('../../../config/env');

/**
 * POST /remarks/report
 * Submit a report/remark for a user or provider
 */
const reportTarget = async (req, res) => {
    try {
        const { targetId, targetRole, category, comment, bookingId } = req.body;
        const reporterId = req.user.id;

        const remark = await remarkService.createRemark({
            reporterId,
            targetId,
            targetRole,
            category,
            comment,
            bookingId
        });

        // --- ADMIN NOTIFICATION ---
        const adminEmail = env.SMTP.SUPPORT_EMAIL; // support@vyapaarconnect.com
        const subject = `[URGENT] New Moderation Report: ${category}`;
        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #C62828;">New Moderation Report Submitted</h2>
                <p>A new report has been filed and requires your attention.</p>
                <hr/>
                <p><b>Reporter ID:</b> ${reporterId}</p>
                <p><b>Target ID:</b> ${targetId} (${targetRole})</p>
                <p><b>Category:</b> ${category}</p>
                <p><b>Booking ID:</b> ${bookingId || 'N/A'}</p>
                <p><b>Comment:</b> ${comment}</p>
                <hr/>
                <p>Please log in to the admin dashboard to moderate this remark.</p>
            </div>
        `;

        // We don't await this to avoid blocking the user's response
        sendEmail(adminEmail, subject, html).catch(err => console.error('[MAIL ERROR] Failed to notify admin of report:', err));

        res.status(201).json({
            status: 'success',
            data: remark
        });
    } catch (error) {
        console.error('[REPORT ERROR]:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Failed to submit report.' });
    }
};

/**
 * GET /remarks/:targetId
 * Get full remark history for a target (Admin Only)
 */
const getTargetRemarks = async (req, res) => {
    try {
        const { targetId } = req.params;
        const remarks = await remarkService.getRemarksForTarget(targetId);

        res.status(200).json({
            status: 'success',
            data: remarks
        });
    } catch (error) {
        console.error('[GET REMARKS ERROR]:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch remarks.' });
    }
};

/**
 * PATCH /remarks/:remarkId/moderate
 * Verify or Dismiss a remark (Admin Only)
 */
const moderateRemark = async (req, res) => {
    try {
        const { remarkId } = req.params;
        const { action } = req.body;
        const moderatorId = req.user.id;

        const result = await remarkService.moderateRemark(remarkId, action, moderatorId);

        res.status(200).json({
            status: 'success',
            data: result
        });
    } catch (error) {
        console.error('[MODERATE REMARK ERROR]:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Moderation failed.' });
    }
};

/**
 * GET /remarks/history/me
 * Get current user's remark history (For Trust & Safety screen)
 */
const getMyRemarks = async (req, res) => {
    try {
        const userId = req.user.id;
        const remarks = await remarkService.getRemarksForUser(userId);

        res.status(200).json({
            status: 'success',
            data: remarks
        });
    } catch (error) {
        console.error('[MY REMARKS ERROR]:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch your history.' });
    }
};

/**
 * POST /remarks/:remarkId/appeal
 * Submit an appeal for a specific remark
 */
const appealRemark = async (req, res) => {
    try {
        const { remarkId } = req.params;
        const { appealText } = req.body;
        const userId = req.user.id;

        const result = await remarkService.appealRemark(remarkId, userId, appealText);

        res.status(200).json({
            status: 'success',
            data: result
        });
    } catch (error) {
        console.error('[APPEAL ERROR]:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Failed to submit appeal.' });
    }
};

/**
 * GET /remarks/all
 * Get all remarks in the system (Admin Only)
 */
const getAllRemarks = async (req, res) => {
    try {
        const remarks = await remarkService.getAllRemarks();
        res.status(200).json({ status: 'success', data: remarks });
    } catch (error) {
        console.error('[GET ALL REMARKS ERROR]:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch global moderation history.' });
    }
};

module.exports = {
    reportTarget,
    getTargetRemarks,
    moderateRemark,
    getMyRemarks,
    appealRemark,
    getAllRemarks
};
