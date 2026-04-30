const reportsService = require('./reports.service');
const { sendReportEmail } = require('../../../utils/mail');

/**
 * Download or Email Provider Activity Report
 * GET /api/provider/reports/download?format=pdf&range=month&shopId=xxx&delivery=download|email
 */
const downloadReport = async (req, res) => {
    try {
        const { format = 'pdf', range = 'month', shopId, delivery = 'download' } = req.query;

        if (!shopId) {
            return res.status(400).json({ status: 'error', message: 'Shop ID is required' });
        }

        console.log(`[REPORTS] 🚀 Generation Started: Format=${format}, Range=${range}, Shop=${shopId}, Delivery=${delivery}`);

        // Calculate Date Range
        const now = new Date();
        let startDate = new Date();
        let endDate = now;

        if (range === 'week') {
            startDate.setDate(now.getDate() - 7);
        } else if (range === 'month') {
            startDate.setMonth(now.getMonth() - 1);
        } else if (range === 'last60') {
            startDate.setDate(now.getDate() - 60);
        } else if (range === 'last90') {
            startDate.setDate(now.getDate() - 90);
        } else if (range === 'year') {
            startDate.setFullYear(now.getFullYear() - 1);
        } else if (range === 'custom') {
            const { start, end } = req.query;
            if (!start || !end) {
                return res.status(400).json({ status: 'error', message: 'Custom range requires start and end dates' });
            }
            startDate = new Date(start);
            endDate = new Date(end);

            // Validation: Max 1 year
            const oneYearAgo = new Date(endDate);
            oneYearAgo.setFullYear(endDate.getFullYear() - 1);
            if (startDate < oneYearAgo) {
                return res.status(400).json({ status: 'error', message: 'Date range cannot exceed 1 year' });
            }
        } else {
            // Default to month if range is invalid
            startDate.setMonth(now.getMonth() - 1);
        }

        const buffer = await reportsService.generateActivityReport(shopId, startDate, endDate, format);
        
        if (!buffer || buffer.length === 0) {
            console.error('[REPORTS] Generated buffer is empty');
            return res.status(500).json({ status: 'error', message: 'Report generation produced no data.' });
        }

        const filename = `Activity_Report_${range}_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
        
        if (delivery === 'email') {
            const userEmail = req.user.email;
            if (!userEmail) {
                return res.status(400).json({ status: 'error', message: 'No email associated with your account.' });
            }

            console.log(`[REPORTS] Emailing report to ${userEmail}`);
            await sendReportEmail(userEmail, `Your Activity Report - ${range}`, buffer, filename);
            return res.json({ status: 'success', message: `Report sent to ${userEmail}` });
        }

        console.log(`[REPORTS] Sending ${format} download response`);

        const contentType = format === 'excel' 
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);

    } catch (error) {
        console.error('[REPORT DOWNLOAD ERROR]:', error);
        
        if (error.message === 'Shop not found') {
            return res.status(404).json({ status: 'error', message: 'The specified shop was not found.' });
        }

        res.status(500).json({ 
            status: 'error', 
            message: 'An internal error occurred during report generation.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    downloadReport
};
