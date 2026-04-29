const prisma = require('../../../db');
const { sendPushToUser } = require('../../common/booking/booking.notification');
const { sendEmail } = require('../../../utils/mail');
const env = require('../../../config/env');

class RemarkService {
    /**
     * Internal: Calculate weight for a remark category
     */
    async _getCategoryWeight(category) {
        // 1. Try to get from Master JSON first
        const categoriesSetting = await prisma.globalSettings.findUnique({ where: { key: 'REMARK_CATEGORIES_JSON' } });
        if (categoriesSetting) {
            const categories = JSON.parse(categoriesSetting.value);
            const cat = categories.find(c => c.id === category.toUpperCase());
            if (cat && cat.weight !== undefined) return parseInt(cat.weight);
        }

        // 2. Fallback: Check for individual setting key (e.g., REMARK_WEIGHT_RUDE)
        const individualKey = `REMARK_WEIGHT_${category.toUpperCase()}`;
        const individualSetting = await prisma.globalSettings.findUnique({ where: { key: individualKey } });
        if (individualSetting) return parseInt(individualSetting.value);

        // 3. Final Fallback: Hardcoded defaults
        const defaultWeights = {
            'RUDE': 1,
            'DELAYED': 2,
            'UNPROFESSIONAL': 2,
            'FRAUD': 4,
            'SAFETY': 5,
        };
        return defaultWeights[category.toUpperCase()] || 1;
    }

    /**
     * Submit a new remark/report
     */
    async createRemark({ reporterId, targetId, targetRole, category, comment, bookingId }) {
        return await prisma.$transaction(async (tx) => {
            // 1. Verify that the booking exists and involves both parties
            if (bookingId) {
                const booking = await tx.booking.findUnique({
                    where: { id: bookingId },
                });

                if (!booking) throw new Error('Booking not found');
                
                // Ensure party logic
                const isCustomerReportingProvider = targetRole === 'PROVIDER' && booking.userId === reporterId;
                const isProviderReportingCustomer = targetRole === 'CUSTOMER' && booking.userId === targetId;
                
                if (!isCustomerReportingProvider && !isProviderReportingCustomer) {
                    throw new Error('You can only report users involved in this booking.');
                }
            }

            // 2. Check for duplicate reports for the same target by same reporter
            const cooldownSetting = await tx.globalSettings.findUnique({ where: { key: 'REMARK_COOLDOWN_HOURS' } });
            const cooldownHours = cooldownSetting ? parseInt(cooldownSetting.value) : 24;

            const whereClause = {
                reporterId,
                targetId,
                bookingId
            };

            if (cooldownHours > 0) {
                whereClause.createdAt = {
                    gte: new Date(Date.now() - cooldownHours * 60 * 60 * 1000)
                };
            }

            const existing = await tx.remark.findFirst({ where: whereClause });

            if (existing) {
                if (cooldownHours === 0) {
                    throw new Error('You have already submitted a report for this user.');
                }
                const hoursLeft = Math.ceil((cooldownHours * 60 * 60 * 1000 - (Date.now() - new Date(existing.createdAt).getTime())) / (60 * 60 * 1000));
                throw new Error(`You have already submitted a report recently. Please wait ${hoursLeft} hours before reporting again.`);
            }

            const weight = await this._getCategoryWeight(category);

            // 3. Create the Remark
            const remark = await tx.remark.create({
                data: {
                    reporterId,
                    targetId,
                    targetRole,
                    category,
                    comment,
                    weight,
                    bookingId
                }
            });

            // 4. Score is NOT updated here anymore - only after Admin verdict
            // 5. Notify both parties
            try {
                // Fetch target email and details
                let targetUser;
                if (targetRole === 'CUSTOMER') {
                    targetUser = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, email: true, fullName: true, remarkScore: true } });
                } else {
                    const shop = await tx.shop.findUnique({ 
                        where: { id: targetId }, 
                        include: { providerProfile: { include: { user: { select: { id: true, email: true, fullName: true } } } } } 
                    });
                    targetUser = shop?.providerProfile?.user;
                    targetUser.remarkScore = shop?.remarkScore || 0;
                }

                const reporter = await tx.user.findUnique({ where: { id: reporterId }, select: { email: true, fullName: true } });

                // Notify Target
                const targetTitle = '🛡️ Trust & Safety Update';
                const targetBody = `A report has been filed regarding your service. Our moderation team is currently reviewing the details.`;
                
                await sendPushToUser(targetUser.id, {
                    title: targetTitle,
                    body: targetBody
                }, { type: 'TRUST_SAFETY_ALERT', remarkId: remark.id, targetContext: targetRole.toLowerCase() });

                if (targetUser.email) {
                    const appLink = `https://${env.DEEP_LINK_DOMAIN}/trust-safety`;
                    await sendEmail(targetUser.email, targetTitle, `
                        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 16px; background-color: #ffffff;">
                            <div style="text-align: center; margin-bottom: 20px;">
                                <h1 style="color: #4F8F6A; margin: 0; font-size: 24px;">🛡️ Trust & Safety Update</h1>
                            </div>
                            
                            <p style="color: #333; font-size: 16px;">Hello ${targetUser.fullName || 'User'},</p>
                            <p style="color: #555; line-height: 1.6;">
                                A report has been filed regarding your service (Ref: ${bookingId?.slice(-6).toUpperCase() || 'N/A'}). 
                                <b>Category:</b> ${category}.
                            </p>
                            
                            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #4F8F6A;">
                                <h4 style="margin-top: 0; color: #4F8F6A;">What is Trust & Safety?</h4>
                                <p style="font-size: 14px; color: #666; margin-bottom: 0;">
                                    Our moderation system ensures a fair and high-quality marketplace. Verified reports result in penalty points that affect your discovery ranking:
                                    <br/>• Each point reduces your visible rating by <b>0.1</b>.
                                    <br/>• Each point adds a <b>1 km</b> virtual distance penalty in search results.
                                </p>
                            </div>

                            <p style="color: #555;">Our team is currently reviewing the report. You will be notified of the final verdict within 24-48 hours.</p>

                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${appLink}" style="background-color: #4F8F6A; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    Check Your Trust Status
                                </a>
                                <p style="font-size: 12px; color: #888; margin-top: 10px;">Clicking the button will open the Vyapaar Connect app.</p>
                            </div>
                            
                            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;"/>
                            <p style="font-size: 12px; color: #aaa; text-align: center;">OnePointSolution Moderation Team</p>
                        </div>
                    `);
                }

                // Notify Reporter
                await sendPushToUser(reporterId, {
                    title: '✅ Report Submitted',
                    body: 'Your report has been received and is under review by our moderation team.'
                }, { type: 'REPORT_SUBMITTED', remarkId: remark.id });
            } catch (err) {
                console.error('[RemarkService] Notification failed:', err.message);
            }

            return remark;
        });
    }

    /**
     * Submit an appeal for a remark
     */
    async appealRemark(remarkId, userId, appealText) {
        const remark = await prisma.remark.findUnique({ where: { id: remarkId } });
        if (!remark) throw new Error('Report not found');

        // Check if user owns the target (User ID or Shop ID)
        let isOwner = remark.targetId === userId;
        
        if (!isOwner && remark.targetRole === 'PROVIDER') {
            const shop = await prisma.shop.findUnique({
                where: { id: remark.targetId },
                include: { providerProfile: true }
            });
            if (shop?.providerProfile?.userId === userId) {
                isOwner = true;
            }
        }

        if (!isOwner) throw new Error('Unauthorized');

        const updated = await prisma.remark.update({
            where: { id: remarkId },
            data: {
                appealText,
                appealStatus: 'PENDING'
            }
        });

        // Notify Admin
        try {
            await sendEmail(env.SMTP.FROM, '🚨 New Moderation Appeal Submitted', `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h2 style="color: #F43F5E;">New Appeal Alert</h2>
                    <p>A provider has appealed a moderation verdict.</p>
                    <p><b>Report ID:</b> ${remarkId}</p>
                    <p><b>Reason:</b> ${appealText}</p>
                    <p>Please review this in the Moderation Hub.</p>
                </div>
            `);
        } catch (e) {
            console.error('[RemarkService] Admin notification failed:', e.message);
        }

        return updated;
    }

    /**
     * Get remarks for a user/shop (Admin View)
     */
    async getRemarksForTarget(targetId) {
        // Find if this is a user and if they have shops
        const shops = await prisma.shop.findMany({
            where: { providerProfile: { userId: targetId } },
            select: { id: true, name: true }
        });

        const targetIds = [targetId, ...shops.map(s => s.id)];

        const remarks = await prisma.remark.findMany({
            where: { targetId: { in: targetIds } },
            orderBy: { createdAt: 'desc' }
        });

        // Map shop names for display
        return remarks.map(r => {
            const shop = shops.find(s => s.id === r.targetId);
            return { ...r, shopName: shop?.name };
        });
    }

    /**
     * Verify or Dismiss a remark (Admin Moderation)
     */
    async moderateRemark(remarkId, action, moderatorId) {
        return await prisma.$transaction(async (tx) => {
            const remark = await tx.remark.findUnique({ 
                where: { id: remarkId }
            });
            if (!remark) throw new Error('Remark not found');

            let updatedRemark = remark;

            if (action === 'VERIFY') {
                // Only increment if not already verified (prevent double penalty)
                if (!remark.isVerified) {
                    if (remark.targetRole === 'CUSTOMER') {
                        await tx.user.update({
                            where: { id: remark.targetId },
                            data: { remarkScore: { increment: remark.weight } }
                        });
                    } else {
                        await tx.shop.update({
                            where: { id: remark.targetId },
                            data: { remarkScore: { increment: remark.weight } }
                        });
                    }

                    // NEW: If there was a previous FALSE_REPORT penalty on the reporter, REVERT it
                    const existingPenalty = await tx.remark.findFirst({
                        where: {
                            targetId: remark.reporterId,
                            category: 'FRAUD',
                            comment: { contains: `(Ref: ${remarkId})` }
                        }
                    });

                    if (existingPenalty) {
                        await tx.user.update({
                            where: { id: remark.reporterId },
                            data: { remarkScore: { decrement: existingPenalty.weight } }
                        });
                        await tx.remark.delete({ where: { id: existingPenalty.id } });
                    }
                }

                updatedRemark = await tx.remark.update({
                    where: { id: remarkId },
                    data: { 
                        isVerified: true,
                        appealStatus: remark.appealText ? 'REJECTED' : null
                    }
                });
            } else if (action === 'FALSE_REPORT' || action === 'DISMISS') {
                // If it WAS verified before, we need to RESTORE the score (decrement)
                if (remark.isVerified) {
                    if (remark.targetRole === 'CUSTOMER') {
                        await tx.user.update({
                            where: { id: remark.targetId },
                            data: { remarkScore: { decrement: remark.weight } }
                        });
                    } else {
                        await tx.shop.update({
                            where: { id: remark.targetId },
                            data: { remarkScore: { decrement: remark.weight } }
                        });
                    }
                }

                // FALSE_REPORT penalizes the reporter for lying.
                // DISMISS just closes the report without penalty to anyone (Universal Dismiss).
                if (action === 'FALSE_REPORT') {
                    // Penalize the REPORTER for lying (only if not already penalized)
                    const existingPenalty = await tx.remark.findFirst({
                        where: {
                            targetId: remark.reporterId,
                            category: 'FRAUD',
                            comment: { contains: `(Ref: ${remarkId})` }
                        }
                    });

                    if (!existingPenalty) {
                        const penaltySetting = await tx.globalSettings.findUnique({ where: { key: 'REMARK_FALSE_REPORT_PENALTY' } });
                        const penaltyWeight = penaltySetting ? parseInt(penaltySetting.value) : 3;
                        
                        await tx.remark.create({
                            data: {
                                reporterId: moderatorId,
                                targetId: remark.reporterId,
                                targetRole: 'CUSTOMER',
                                category: 'FRAUD',
                                comment: `System: Verified false report penalty (Ref: ${remarkId})`,
                                weight: penaltyWeight,
                                isVerified: true
                            }
                        });

                        await tx.user.update({
                            where: { id: remark.reporterId },
                            data: { remarkScore: { increment: penaltyWeight } }
                        });
                    }
                }

                // Update original remark to NOT verified
                updatedRemark = await tx.remark.update({ 
                    where: { id: remarkId },
                    data: { 
                        isVerified: false,
                        appealStatus: action === 'FALSE_REPORT' ? 'ACCEPTED' : 'DISMISSED' 
                    }
                });
            }

            // 4. Notify both parties
            try {
                // Fetch parties details
                const reporter = await tx.user.findUnique({ where: { id: remark.reporterId }, select: { id: true, email: true, fullName: true } });
                
                let targetUser;
                if (remark.targetRole === 'CUSTOMER') {
                    targetUser = await tx.user.findUnique({ where: { id: remark.targetId }, select: { id: true, email: true, fullName: true } });
                } else {
                    const shop = await tx.shop.findUnique({ 
                        where: { id: remark.targetId }, 
                        include: { providerProfile: { include: { user: { select: { id: true, email: true, fullName: true } } } } } 
                    });
                    targetUser = shop?.providerProfile?.user;
                }

                const title = action === 'VERIFY' ? '🛡️ Moderation Verdict' : '✅ Report Dismissed';
                
                // Notify Target
                const targetBody = action === 'VERIFY' 
                    ? `Penalty Applied: Trust score -${remark.weight} (Rating -${(remark.weight * 0.1).toFixed(1)} / Distance +${remark.weight}km). Appeal within 24hrs!`
                    : 'A report against you was dismissed. Your trust score and ranking have been restored!';
                
                await sendPushToUser(targetUser.id, { title, body: targetBody }, { type: 'MODERATION_DECISION', remarkId, targetContext: remark.targetRole.toLowerCase() });
                
                if (targetUser.email) {
                    const appLink = `https://${env.DEEP_LINK_DOMAIN}/trust-safety`;
                    await sendEmail(targetUser.email, title, `
                        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 16px; background-color: #ffffff;">
                            <div style="text-align: center; margin-bottom: 20px;">
                                <h1 style="color: ${action === 'VERIFY' ? '#F43F5E' : '#4F8F6A'}; margin: 0; font-size: 24px;">🛡️ Moderation Verdict</h1>
                            </div>
                            
                            <p style="color: #333; font-size: 16px;">Hello ${targetUser.fullName || 'User'},</p>
                            <p style="color: #555; line-height: 1.6;">${targetBody}</p>

                            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #4F8F6A;">
                                <h4 style="margin-top: 0; color: #4F8F6A;">Ranking Impact Explained</h4>
                                <p style="font-size: 14px; color: #666; margin-bottom: 0;">
                                    Your trust score directly impacts how customers find you:
                                    <br/>• Rating Impact: <b>-0.1 per point</b>
                                    <br/>• Distance Impact: <b>+1 km per point</b>
                                </p>
                            </div>

                            ${action === 'VERIFY' ? `
                            <div style="text-align: center; margin: 30px 0;">
                                <p style="color: #F43F5E; font-weight: bold; font-size: 14px; margin-bottom: 15px;">⚠️ You have 24 hours to contest this decision.</p>
                                <a href="${appLink}" style="background-color: #F43F5E; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    APPEAL NOW
                                </a>
                            </div>
                            ` : `
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${appLink}" style="background-color: #4F8F6A; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    View Trust Dashboard
                                </a>
                            </div>
                            `}
                            
                            <p style="font-size: 12px; color: #aaa; text-align: center; margin-top: 30px;">
                                Clicking the buttons will open the Vyapaar Connect app directly to your moderation details.
                            </p>
                        </div>
                    `);
                }

                // Notify Reporter
                const reporterBody = action === 'VERIFY' 
                    ? 'Your report has been verified. Thank you for helping keep Vyapaar Connect safe.'
                    : 'Your report was found to be inaccurate. Please ensure reports are truthful to avoid penalties.';
                
                await sendPushToUser(reporter.id, { title: '⚖️ Report Outcome', body: reporterBody }, { type: 'MODERATION_DECISION', remarkId });

                if (reporter.email) {
                    await sendEmail(reporter.email, 'Report Resolution Update', `
                        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                            <h2 style="color: #4F8F6A;">Report Outcome</h2>
                            <p>Hello ${reporter.fullName || 'User'},</p>
                            <p>${reporterBody}</p>
                            <p>We appreciate your commitment to the community.</p>
                        </div>
                    `);
                }
            } catch (err) {
                console.error('[RemarkService] Final verdict notification failed:', err.message);
            }

            return updatedRemark;
        });
    }

    /**
     * Get remarks targeting a specific user (for their history/appeal screen)
     */
    async getRemarksForUser(userId) {
        // Check if user is a provider and get ALL their shops
        const shops = await prisma.shop.findMany({
            where: { providerProfile: { userId } },
            select: { id: true }
        });

        const targetIds = [userId, ...shops.map(s => s.id)];

        console.log(`🛡️ [RemarkService] Fetching remarks for user ${userId}. Targets:`, targetIds);

        const remarks = await prisma.remark.findMany({
            where: { 
                targetId: { in: targetIds },
                NOT: {
                    appealStatus: { in: ['DISMISSED', 'ACCEPTED'] }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Enrich remarks with shop names if possible
        const enrichedRemarks = await Promise.all(remarks.map(async (r) => {
            if (r.targetRole === 'PROVIDER') {
                const shop = await prisma.shop.findUnique({
                    where: { id: r.targetId },
                    select: { name: true }
                });
                return { ...r, shopName: shop?.name || 'Unknown Shop' };
            }
            return r;
        }));

        return enrichedRemarks;
    }

    /**
     * Get ALL remarks for the Admin Moderation Hub
     */
    async getAllRemarks() {
        const remarks = await prisma.remark.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Enrich with Names and Booking Details
        return await Promise.all(remarks.map(async (r) => {
            let targetName = 'Unknown';
            let targetScore = 0;

            // Fetch Reporter
            const reporter = await prisma.user.findUnique({
                where: { id: r.reporterId },
                select: { fullName: true, phone: true }
            });

            // Fetch Booking
            const booking = r.bookingId ? await prisma.booking.findUnique({
                where: { id: r.bookingId },
                select: { displayId: true }
            }) : null;

            if (r.targetRole === 'PROVIDER') {
                const shop = await prisma.shop.findUnique({
                    where: { id: r.targetId },
                    select: { name: true, remarkScore: true }
                });
                targetName = shop?.name || 'Unknown Shop';
                targetScore = shop?.remarkScore || 0;
            } else {
                const user = await prisma.user.findUnique({
                    where: { id: r.targetId },
                    select: { fullName: true, remarkScore: true }
                });
                targetName = user?.fullName || 'Unknown User';
                targetScore = user?.remarkScore || 0;
            }

            return { ...r, targetName, targetScore, reporter, booking };
        }));
    }
}

module.exports = new RemarkService();
