const walletService = require('../modules/common/wallet/wallet.service');

/**
 * Wallet Middleware — Guards paid actions
 */

/**
 * requireCredits: Ensure user has enough budget for a high-value action
 * @param {Number} requiredAmount - Credits to verify (default 5)
 */
const requireCredits = (requiredAmount = 5) => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;
            
            // Note: getBalance also initializes a new wallet with 0 balance if it doesn't exist
            const balance = await walletService.getBalance(userId);

            if (balance < requiredAmount) {
                return res.status(402).json({
                    status: 'error',
                    code: 'INSUFFICIENT_CREDITS',
                    message: `You need ${requiredAmount} credits to perform this action. Current balance: ${balance}`,
                    requiredCredits: requiredAmount,
                    currentBalance: balance
                });
            }

            // Carry balance to the request for possible display in response headers/body
            req.walletBalance = balance;
            next();
        } catch (error) {
            console.error('[CREDIT_GUARD_ERROR]', error);
            res.status(500).json({ status: 'error', message: 'Balance verification failed' });
        }
    };
};

module.exports = { requireCredits };
