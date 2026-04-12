const razorpay = require('../../../config/razorpay');
const walletService = require('../../common/wallet/wallet.service');
const prisma = require('../../../db');
const crypto = require('crypto');

/**
 * WalletController — Provider-side wallet and payment actions
 */
class WalletController {
    /**
     * Fetch current provider balance and history
     */
    async getOverview(req, res) {
        try {
            const userId = req.user.id;
            const balance = await walletService.getBalance(userId);
            const history = await walletService.getTransactionHistory(userId);

            res.status(200).json({ status: 'success', data: { balance, history } });
        } catch (error) {
            console.error('Wallet fetch error:', error);
            res.status(500).json({ error: 'Error fetching wallet data' });
        }
    }

    /**
     * Create a Razorpay Order for purchasing credits
     */
    async createOrder(req, res) {
        try {
            const { planId, couponCode } = req.body;
            const userId = req.user.id;

            // 1. Fetch Plan from DB
            const plan = await prisma.creditPlan.findUnique({
                where: { id: planId }
            });

            if (!plan) {
                return res.status(400).json({ error: 'Invalid plan selected' });
            }

            let finalPrice = plan.price;
            let appliedCouponId = null;

            // 2. Apply Coupon if provided
            if (couponCode) {
                const coupon = await prisma.coupon.findUnique({
                    where: { code: couponCode.toUpperCase() }
                });

                if (coupon && coupon.isActive && !coupon.isRedeemable) {
                    // Check usage limit before allowing order creation
                    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
                        return res.status(400).json({ error: 'Coupon usage limit reached' });
                    }

                    // [DISCOUNT CALCULATION] - Case-insensitive type check
                    const type = (coupon.type || '').toUpperCase();
                    if (type === 'PERCENT') {
                        finalPrice = plan.price - (plan.price * coupon.discount / 100);
                    } else {
                        finalPrice = plan.price - coupon.discount;
                    }
                    finalPrice = Math.max(0, finalPrice);
                    appliedCouponId = coupon.id;
                }
            }

            // 3. Handle Zero-Amount or Minimum Amount
            if (finalPrice <= 0) {
                // Fulfill instantly (Free plan or 100% coupon)
                const dbOrder = await prisma.creditOrder.create({
                    data: {
                        userId,
                        planId,
                        amount: 0,
                        currency: "INR",
                        status: 'paid', // Mark as paid immediately
                        metadata: {
                            couponCode: couponCode || null,
                            originalPrice: plan.price,
                            discountApplied: plan.price,
                            note: "Auto-fulfilled (Zero amount)"
                        }
                    }
                });

                const fulfillment = await walletService.fulfillOrder(userId, dbOrder.id, "ZERO_PAY_" + Date.now(), "INTERNAL_BYPASS");

                return res.status(201).json({
                    status: 'success',
                    message: 'Order fulfilled instantly!',
                    data: {
                        orderId: dbOrder.id,
                        razorpayOrderId: null,
                        amount: 0,
                        isFree: true
                    }
                });
            }

            // Razorpay minimum amount is ₹1.00 (100 paise)
            if (finalPrice < 1) {
                return res.status(400).json({ error: 'Final amount must be at least ₹1.00' });
            }

            // 4. Create Order on Razorpay
            const options = {
                amount: Math.round(finalPrice * 100), // Amount in paise
                currency: "INR",
                receipt: `rcpt_wallet_${Date.now()}`,
                notes: {
                    planLabel: plan.label || `${plan.credits} Credits`,
                    userId: userId
                }
            };

            const razorOrder = await razorpay.orders.create(options);

            // 5. Save Order in DB as 'created'
            const dbOrder = await prisma.creditOrder.create({
                data: {
                    userId,
                    planId,
                    amount: finalPrice,
                    currency: "INR",
                    razorpayOrderId: razorOrder.id,
                    status: 'created',
                    metadata: {
                        couponCode: couponCode || null,
                        originalPrice: plan.price,
                        discountApplied: plan.price - finalPrice
                    }
                }
            });

            res.status(201).json({ 
                status: 'success', 
                data: {
                    orderId: dbOrder.id,
                    razorpayOrderId: razorOrder.id,
                    razorpayKeyId: process.env.RAZORPAY_KEY_ID, // Send public key to frontend
                    amount: razorOrder.amount,
                    currency: razorOrder.currency,
                    isFree: false
                }
            });
        } catch (error) {
            console.error('Order creation error:', error);
            res.status(500).json({ error: 'Failed to create payment order' });
        }
    }

    /**
     * Apply or Redeem a Coupon
     * Handles both direct credit redemption and purchase discounts
     */
    async applyCoupon(req, res) {
        try {
            const { code } = req.body;
            const userId = req.user.id;

            if (!code) return res.status(400).json({ error: 'Coupon code is required' });

            // 1. Fetch Coupon info
            const coupon = await prisma.coupon.findUnique({
                where: { code: code.toUpperCase() }
            });

            if (!coupon || !coupon.isActive) {
                return res.status(400).json({ error: 'Invalid or inactive coupon code' });
            }

            // [VALIDATION LOGIC] Check dates, usage limits, target user
            const now = new Date();
            if (coupon.startDate && now < coupon.startDate) throw new Error('Promotion hasn\'t started yet');
            if (coupon.expiryDate && now > coupon.expiryDate) throw new Error('Promotion has expired');
            if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new Error('Usage limit reached');
            if (coupon.targetUserId && coupon.targetUserId !== userId) throw new Error('Not valid for your account');

            // 2. Decide Action: Redeem (Bonus Coins) vs Validate (Discount)
            if (coupon.isRedeemable) {
                const result = await walletService.redeemCoupon(userId, code);
                return res.status(200).json({
                    status: 'success',
                    message: `₹${coupon.creditsAwarded} credited to your wallet!`,
                    data: { ...coupon, isRedeemed: true }
                });
            } else {
                // Return coupon info for frontend to apply discount on plan price
                const type = (coupon.type || '').toUpperCase();
                return res.status(200).json({
                    status: 'success',
                    message: type === 'PERCENT' ? `${coupon.discount}% OFF applied` : `₹${coupon.discount} OFF applied`,
                    data: { ...coupon, isRedeemed: false }
                });
            }
        } catch (error) {
            console.error('Coupon application error:', error.message);
            res.status(400).json({ error: error.message || 'Failed to apply coupon' });
        }
    }

    /**
     * Verify the payment signature and fulfill the credit purchase
     */
    async verifyPayment(req, res) {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
        const userId = req.user.id;

        try {
            // 1. Verify Signature
            const body = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSignature = crypto
                .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret')
                .update(body.toString())
                .digest("hex");

            // [SIMULATION MODE] — Allow mock signatures in development for Expo Go testing
            const isMock = razorpay_signature === 'MOCK_SIGNATURE' && process.env.NODE_ENV === 'development';
            const isAuthentic = isMock || expectedSignature === razorpay_signature;

            if (!isAuthentic) {
                // LOG FAILURE
                await walletService.recordFailedTransaction(userId, 'PURCHASE', 'Invalid payment signature', { 
                    orderId, 
                    metadata: { razorpayOrderId: razorpay_order_id } 
                });
                await prisma.creditOrder.update({ where: { id: orderId }, data: { status: 'failed' } }).catch(() => {});
                
                return res.status(400).json({ error: 'Invalid payment signature' });
            }

            // 2. Fulfill the order (Balance increment + Ledger)
            const result = await walletService.fulfillOrder(userId, orderId, razorpay_payment_id, razorpay_signature);

            res.status(200).json({ 
                status: 'success', 
                message: 'Payment verified and credits added',
                data: result
            });
        } catch (error) {
            console.error('Payment verification error:', error);
            
            // LOG FAILURE
            if (userId && orderId) {
                await walletService.recordFailedTransaction(userId, 'PURCHASE', error.message, { 
                    orderId, 
                    metadata: { razorpayOrderId: razorpay_order_id } 
                });
                await prisma.creditOrder.update({ where: { id: orderId }, data: { status: 'failed' } }).catch(() => {});
            }

            res.status(500).json({ error: 'Error verifying payment fulfillment' });
        }
    }

    /**
     * Razorpay Webhook Handler for asynchronous fulfillment (Fallback)
     */
    async handleWebhook(req, res) {
        try {
            const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'placeholder_secret';
            const signature = req.headers["x-razorpay-signature"];

            const isVerified = crypto
                .createHmac("sha256", secret)
                .update(JSON.stringify(req.body))
                .digest("hex") === signature;

            if (!isVerified) {
                return res.status(403).json({ error: 'Invalid webhook signature' });
            }

            const event = req.body.event;
            const payload = req.body.payload.payment.entity;

            if (event === 'payment.captured') {
                const razorOrderId = payload.order_id;
                
                // Find order in DB
                const order = await prisma.creditOrder.findUnique({
                    where: { razorpayOrderId: razorOrderId }
                });

                if (order && order.status !== 'paid') {
                    await walletService.fulfillOrder(
                        order.userId, 
                        order.id, 
                        payload.id, 
                        'WEBHOOK_VERIFIED'
                    );
                }
            }

            res.status(200).json({ status: 'ok' });
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    }
}

module.exports = new WalletController();
