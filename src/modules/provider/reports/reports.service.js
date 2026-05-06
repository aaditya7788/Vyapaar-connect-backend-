const prisma = require('../../../db');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const path = require('path');
const axios = require('axios');
const env = require('../../../config/env');

const APP_LOGO_S3_URL = `${env.AWS.S3_BASE_URL}/uploads/branding/icon.png`.replace(/\/+/g, '/').replace('https:/', 'https://');

/**
 * Generate Activity Report for a Provider Shop
 * @param {string} shopId 
 * @param {Date} startDate 
 * @param {Date} endDate 
 * @param {string} format 'pdf' | 'excel'
 */
const generateActivityReport = async (shopId, startDate, endDate, format = 'pdf') => {
    // 1. Fetch Data
    const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        include: { services: true }
    });

    if (!shop) throw new Error('Shop not found');

    const bookings = await prisma.booking.findMany({
        where: {
            shopId,
            createdAt: { gte: startDate, lte: endDate }
        },
        include: {
            user: { select: { fullName: true, phone: true } },
            services: true
        },
        orderBy: { createdAt: 'desc' }
    });

    // 2. Calculate Summary
    const totalBookings = bookings.length;
    const completedBookings = bookings.filter(b => b.status === 'COMPLETED');
    const cancelledBookings = bookings.filter(b => b.status === 'CANCELLED');
    const totalAmount = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const completedAmount = completedBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    if (format === 'excel') {
        return await generateExcel(shop, bookings, { totalBookings, completedBookings, cancelledBookings, totalAmount, completedAmount }, startDate, endDate);
    } else {
        return await generatePDF(shop, bookings, { totalBookings, completedBookings, cancelledBookings, totalAmount, completedAmount }, startDate, endDate);
    }
};

/**
 * Helper: Generate Excel File
 */
async function generateExcel(shop, bookings, stats, start, end) {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Activity Report');

        // Headers
        sheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Booking ID', key: 'id', width: 20 },
            { header: 'Customer', key: 'customer', width: 25 },
            { header: 'Services', key: 'services', width: 40 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Amount', key: 'amount', width: 15 },
        ];

        // Data
        bookings.forEach(b => {
            const dateStr = b.createdAt instanceof Date ? b.createdAt.toISOString().split('T')[0] : String(b.createdAt);
            sheet.addRow({
                date: dateStr,
                id: b.displayId || b.id.substring(0, 8),
                customer: b.user?.fullName || 'N/A',
                services: b.services.map(s => s.name).join(', '),
                status: b.status,
                amount: b.totalAmount
            });
        });

        // Summary at the bottom
        sheet.addRow({});
        sheet.addRow({ date: 'SUMMARY' });
        sheet.addRow({ date: 'Total Bookings', id: stats.totalBookings });
        sheet.addRow({ date: 'Completed', id: stats.completedBookings.length });
        sheet.addRow({ date: 'Total Earnings', id: stats.completedAmount });

        return await workbook.xlsx.writeBuffer();
    } catch (err) {
        console.error('[REPORTS] Error in Excel generation:', err);
        throw err;
    }
}

/**
 * Helper: Generate PDF File with Premium Design
 */
async function generatePDF(shop, bookings, stats, start, end) {
    // Fetch Logo Buffer from S3
    let logoBuffer = null;
    try {
        const response = await axios.get(APP_LOGO_S3_URL, { responseType: 'arraybuffer' });
        logoBuffer = Buffer.from(response.data);
    } catch (error) {
        console.error('[REPORTS] Failed to fetch logo from S3, falling back to local if possible:', error.message);
    }

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ 
                margin: 40,
                size: 'A4',
                bufferPages: true,
                info: { Title: 'Business Activity Report', Author: 'Vyapaar Connect' }
            });

            // Handle errors
            doc.on('error', (err) => {
                console.error('[PDF GENERATION ERROR]:', err);
                reject(err);
            });
            
            // Register Custom Fonts for Rupee Support
            const regularFont = path.join(__dirname, '../../../assets/fonts/inter_regular.ttf');
            const boldFont = path.join(__dirname, '../../../assets/fonts/inter_bold.ttf');
            
            doc.registerFont('Inter-Regular', regularFont);
            doc.registerFont('Inter-Bold', boldFont);
            
            // Set Default Font
            doc.font('Inter-Regular');

            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                console.log('[REPORTS] PDF Stream Ended, resolving buffer');
                resolve(Buffer.concat(buffers));
            });

            // --- THEME COLORS ---
            const colors = {
                primary: '#2E7D32',
                secondary: '#1B5E20',
                text: '#333333',
                muted: '#666666',
                border: '#EEEEEE',
                bg: '#F9F9F9'
            };

            // --- HEADER HELPER ---
            const drawHeader = (isFirstPage = false) => {
                doc.rect(0, 0, 595, 100).fill(colors.primary);
                
                // Add Logo
                try {
                    if (logoBuffer) {
                        doc.image(logoBuffer, 40, 28, { width: 35 });
                    } else {
                        // Minimal fallback if logo fails
                        const fallbackPath = path.join(__dirname, '../../../../../assets/icon.png');
                        doc.image(fallbackPath, 40, 28, { width: 35 });
                    }
                } catch (err) {
                    console.error('[REPORTS] Logo image fallback also failed:', err.message);
                }

                doc.fillColor('#FFFFFF').font('Inter-Bold').fontSize(24).text('VYAPAAR CONNECT', 85, 30, { characterSpacing: 2 });
                doc.font('Inter-Regular').fontSize(10).text('OFFICIAL BUSINESS REPORT', 85, 60);
                
                doc.fillColor('#FFFFFF').fontSize(12).text(String(shop.name || 'Your Shop').toUpperCase(), 400, 35, { align: 'right' });
                doc.fontSize(10).text(`Generated: ${new Date().toLocaleString('en-IN')}`, 400, 55, { align: 'right' });
                doc.text(`Period: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`, 400, 70, { align: 'right' });
            };

            // --- FIRST PAGE HEADER ---
            console.log('[REPORTS] Building First Page Header...');
            drawHeader(true);

            doc.moveDown(4);

            // --- 4-GRID ANALYTICS SECTION ---
            console.log('[REPORTS] Building Analytics Grid...');
            doc.fillColor(colors.text).font('Inter-Bold').fontSize(16).text('Business Performance', 40, 120);
            doc.rect(40, 140, 520, 1).fill(colors.border);
            
            const gridTop = 160;
            
            // Views
            doc.fillColor(colors.muted).font('Inter-Regular').fontSize(10).text('TOTAL VIEWS', 40, gridTop);
            doc.fillColor(colors.primary).font('Inter-Bold').fontSize(18).text(String(shop.views || 0), 40, gridTop + 15);
            
            // Leads
            doc.fillColor(colors.muted).font('Inter-Regular').fontSize(10).text('TOTAL LEADS', 180, gridTop);
            doc.fillColor(colors.primary).font('Inter-Bold').fontSize(18).text(String(stats.totalBookings || 0), 180, gridTop + 15);
            
            // Completed
            doc.fillColor(colors.muted).font('Inter-Regular').fontSize(10).text('COMPLETED', 320, gridTop);
            doc.fillColor(colors.primary).font('Inter-Bold').fontSize(18).text(String(stats.completedBookings.length || 0), 320, gridTop + 15);
            
            // Revenue
            doc.fillColor(colors.muted).font('Inter-Regular').fontSize(10).text('REVENUE', 460, gridTop);
            const revenue = typeof stats.completedAmount === 'number' ? stats.completedAmount : 0;
            doc.fillColor('#2E7D32').font('Inter-Bold').fontSize(18).text(`₹${revenue.toFixed(0)}`, 460, gridTop + 15);

            doc.moveDown(5);

            // --- TOP SERVICES PERFORMANCE ---
            console.log('[REPORTS] Building Service Insights...');
            const serviceStats = {};
            bookings.forEach(b => {
                b.services.forEach(s => {
                    if (!serviceStats[s.id]) serviceStats[s.id] = { name: s.name, count: 0, revenue: 0 };
                    serviceStats[s.id].count++;
                    if (b.status === 'COMPLETED') serviceStats[s.id].revenue += (s.price || 0);
                });
            });

            const topServices = Object.values(serviceStats).sort((a, b) => b.count - a.count).slice(0, 5);

            doc.fillColor(colors.text).font('Inter-Bold').fontSize(14).text('Service Insights', 40, 230);
            let serviceY = 255;
            
            // Table Header for services
            doc.rect(40, serviceY, 520, 20).fill('#F5F5F5');
            doc.fillColor(colors.muted).font('Inter-Regular').fontSize(9);
            doc.text('SERVICE NAME', 50, serviceY + 6);
            doc.text('REQUESTS', 300, serviceY + 6);
            doc.text('EST. REVENUE', 450, serviceY + 6);
            
            serviceY += 25;
            topServices.forEach(s => {
                doc.fillColor(colors.text).font('Inter-Regular').fontSize(10).text(String(s.name), 50, serviceY);
                doc.text(String(s.count), 300, serviceY);
                const sRevenue = typeof s.revenue === 'number' ? s.revenue : 0;
                doc.text(`₹${sRevenue.toFixed(0)}`, 450, serviceY);
                doc.rect(40, serviceY + 12, 520, 0.5).fill(colors.border);
                serviceY += 20;
            });

            // --- RECENT BOOKINGS LOG ---
            console.log('[REPORTS] Building Activity Log...');
            doc.moveDown(2);
            const logTop = serviceY + 20;
            doc.fillColor(colors.text).font('Inter-Bold').fontSize(14).text('Activity Log (Last 50)', 40, logTop);
            
            let logY = logTop + 25;
            doc.rect(40, logY, 520, 20).fill(colors.primary);
            doc.fillColor('#FFFFFF').font('Inter-Bold').fontSize(8);
            doc.text('DATE', 50, logY + 7);
            doc.text('CUSTOMER', 110, logY + 7);
            doc.text('SERVICES', 220, logY + 7);
            doc.text('STATUS', 400, logY + 7);
            doc.text('AMOUNT', 480, logY + 7);

            logY += 25;
            bookings.slice(0, 50).forEach(b => {
                if (logY > 750) {
                    doc.addPage();
                    drawHeader();
                    logY = 120; // Start below the 100px header
                    doc.rect(40, logY, 520, 20).fill(colors.primary);
                    doc.fillColor('#FFFFFF').font('Inter-Bold').fontSize(8);
                    doc.text('DATE', 50, logY + 7);
                    doc.text('CUSTOMER', 110, logY + 7);
                    doc.text('SERVICES', 220, logY + 7);
                    doc.text('STATUS', 400, logY + 7);
                    doc.text('AMOUNT', 480, logY + 7);
                    logY += 25;
                }

                doc.fillColor(colors.text).font('Inter-Regular').fontSize(8);
                doc.text(b.createdAt.toLocaleDateString(), 50, logY);
                doc.text(String(b.user?.fullName || 'N/A').substring(0, 15), 110, logY);
                doc.text(String(b.services.map(s => s.name).join(', ')).substring(0, 35), 220, logY);
                
                const statusColor = b.status === 'COMPLETED' ? '#2E7D32' : b.status === 'CANCELLED' ? '#C62828' : '#F57C00';
                doc.fillColor(statusColor).text(String(b.status), 400, logY);
                doc.fillColor(colors.text).text(`₹${String(b.totalAmount || 0)}`, 480, logY);
                
                doc.rect(40, logY + 10, 520, 0.5).fill(colors.border);
                logY += 18;
            });

            // --- FOOTER ---
            const pageCount = doc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                doc.fillColor(colors.muted).fontSize(8).text(
                    `Page ${i + 1} of ${pageCount} | Vyapaar Connect Business Intel`,
                    40, 800, { align: 'center' }
                );
            }

            doc.end();
            console.log('[REPORTS] PDF doc.end() called');
        } catch (err) {
            console.error('[REPORTS] Synchronous error in PDF generation:', err);
            reject(err);
        }
    });
}

module.exports = {
    generateActivityReport
};
