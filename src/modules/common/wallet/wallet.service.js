const prisma = require('../../../db');
const { v4: uuidv4 } = require('uuid');

/**
 * WalletService — Unified logic for credit management
 */
class WalletService {
    /**
     * Internal helper to generate systematic transaction IDs
     */
    _generateId(type) {
        const prefixMap = {
            'PURCHASE': 'PURCHASE',
            'USED': 'FEE',
            'REFUND': 'REFUND',
            'BONUS': 'BONUS'
        };
        const prefix = prefixMap[type] || 'TX';
        const hex = uuidv4().split('-')[0].toUpperCase();
        return `${prefix}-${hex}`;
    }
    /**
     * Get user's current credit balance
     */
    async getBalance(userId) {
        const credits = await prisma.userCredits.findUnique({
            where: { userId }
        });
        
        // If no credit record exists yet, initialize with 0
        if (!credits) {
            return await this.initializeWallet(userId);
        }
        
        return credits.balance;
    }

    /**
     * Initialized a wallet for a user if it doesn't exist
     */
    async initializeWallet(userId) {
        return await prisma.userCredits.create({
            data: {
                userId,
                balance: 0
            }
        }).then(res => res.balance);
    }

    /**
     * Fetch credit transaction history for a user
     */
    async getTransactionHistory(userId, limit = 20) {
        return await prisma.creditTransaction.findMany({
            where: { userId },
            include: {
                booking: {
                    select: {
                        id: true,
                        displayId: true,
                        status: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
    }

    /**
     * Add credits to a user's wallet
     * Uses DB transaction for atomic execution
     */
    async addCredits(userId, amount, type = 'PURCHASE', description = '', options = {}, tx = null) {
        const { metadata = {}, bookingId = null, orderId = null, status = 'SUCCESS' } = options;
        
        const op = async (db) => {
            // 1. Update/Create Balance (Only if SUCCESS)
            let walletBalance = 0;
            if (status === 'SUCCESS') {
                const wallet = await db.userCredits.upsert({
                    where: { userId },
                    create: { userId, balance: amount },
                    update: { balance: { increment: amount } }
                });
                walletBalance = wallet.balance;
            }

            // 2. Log Ledger Entry
            await db.creditTransaction.create({
                data: {
                    id: this._generateId(type),
                    userId,
                    amount: status === 'SUCCESS' ? amount : 0,
                    type,
                    description,
                    bookingId,
                    orderId,
                    status,
                    metadata
                }
            });

            return walletBalance;
        };

        if (tx) return await op(tx);
        return await prisma.$transaction(async (pTx) => await op(pTx));
    }

    /**
     * Deduct credits from a user's wallet
     * Throws error if balance is insufficient
     */
    async deductCredits(userId, amount, type = 'USED', description = '', options = {}, tx = null) {
        const { metadata = {}, bookingId = null } = options;

        const op = async (db) => {
            // 1. Check existing balance
            const wallet = await db.userCredits.findUnique({
                where: { userId }
            });

            if (!wallet || wallet.balance < amount) {
                throw new Error('Insufficient credit balance');
            }

            // 2. Deduct credits
            const updatedWallet = await db.userCredits.update({
                where: { userId },
                data: { balance: { decrement: amount } }
            });

            // 3. Log Ledger Entry
            await db.creditTransaction.create({
                data: {
                    id: this._generateId(type),
                    userId,
                    amount: -amount,
                    type,
                    description,
                    bookingId,
                    status: 'SUCCESS',
                    metadata
                }
            });

            return updatedWallet.balance;
        };

        if (tx) return await op(tx);
        return await prisma.$transaction(async (pTx) => await op(pTx));
    }

    /**
     * Fulfillment logic for a successful Razorpay Order
     */
    async fulfillOrder(userId, orderId, paymentId, signature) {
        return await prisma.$transaction(async (tx) => {
            // 1. Fetch Order and Status (Idempotency)
            const order = await tx.creditOrder.findUnique({
                where: { id: orderId }
            });

            if (!order) throw new Error('Order not found');
            if (order.status === 'paid') return order; // Already fulfilled

            // 2. Fetch Plan Credits (Dynamic from DB)
            const plan = await tx.creditPlan.findUnique({
                where: { id: order.planId }
            });

            const creditsToAdd = plan ? plan.credits : parseInt(order.planId.replace(/\D/g, ''));

            // 3. Update Order Status
            const updatedOrder = await tx.creditOrder.update({
                where: { id: orderId },
                data: {
                    status: 'paid',
                    paymentId,
                    signature
                }
            });

            // 4. Update Coupon Usage if applied
            const metadata = order.metadata || {};
            if (metadata.couponCode) {
                await tx.coupon.updateMany({
                    where: { code: metadata.couponCode.toUpperCase() },
                    data: { usedCount: { increment: 1 } }
                });
            }

            // 5. Add Credits (Refactored to use central addCredits helper)
            await this.addCredits(
                userId, 
                creditsToAdd, 
                'PURCHASE', 
                `Wallet recharge via Order #${order.razorpayOrderId}`, 
                { 
                    orderId, 
                    metadata: { razorpayOrderId: order.razorpayOrderId } 
                }, 
                tx
            );

            return updatedOrder;
        });
    }

    /**
     * Redeem a "coin" coupon for credits
     */
    async redeemCoupon(userId, couponCode) {
        return await prisma.$transaction(async (tx) => {
            // 1. Find and Validate coupon
            const coupon = await tx.coupon.findUnique({
                where: { code: couponCode.toUpperCase() }
            });

            if (!coupon || !coupon.isActive) throw new Error('Invalid or inactive coupon');
            if (!coupon.isRedeemable) throw new Error('This coupon cannot be redeemed for coins');

            // Date validation
            const now = new Date();
            if (coupon.startDate && now < coupon.startDate) throw new Error('Coupon not yet active');
            if (coupon.expiryDate && now > coupon.expiryDate) throw new Error('Coupon expired');

            // Usage limits
            if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
                throw new Error('Coupon usage limit reached');
            }

            // Target user check
            if (coupon.targetUserId && coupon.targetUserId !== userId) {
                throw new Error('This coupon is not valid for your account');
            }

            // 2. Add Credits
            const amount = coupon.creditsAwarded || 0;
            await tx.userCredits.upsert({
                where: { userId },
                create: { userId, balance: amount },
                update: { balance: { increment: amount } }
            });

            // 3. Update Coupon Usage
            await tx.coupon.update({
                where: { id: coupon.id },
                data: { usedCount: { increment: 1 } }
            });

            // 4. Log Transaction
            await tx.creditTransaction.create({
                data: {
                    id: this._generateId('BONUS'),
                    userId,
                    amount,
                    type: 'BONUS',
                    description: `Coupon Redemption: ${couponCode}`,
                    metadata: { couponId: coupon.id, code: couponCode }
                }
            });

            return { creditsAdded: amount };
        });
    }

    /**
     * Log a failed transaction for audit trail
     */
    async recordFailedTransaction(userId, type, description, options = {}) {
        return await this.addCredits(userId, 0, type, description, { ...options, status: 'FAILED' });
    }
}

module.exports = new WalletService();
