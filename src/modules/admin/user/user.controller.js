const prisma = require('../../../db');

/**
 * @desc Search users by name, phone, or email
 * @route GET /api/admin/users/search
 */
exports.searchUsers = async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.status(200).json({ status: 'success', data: [] });
        }

        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { fullName: { contains: q, mode: 'insensitive' } },
                    { phone: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } },
                ],
            },
            select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
                avatar: true,
                roles: true,
            },
            take: 20,
        });

        res.status(200).json({ status: 'success', data: users });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get all users with basic stats
 * @route GET /api/admin/users/list
 */
exports.listUsers = async (req, res) => {
    try {
        const { role, status } = req.query;
        
        const where = {};
        if (role) where.roles = { has: role.toLowerCase() };
        if (status) where.status = status;

        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
                avatar: true,
                roles: true,
                status: true,
                createdAt: true,
                _count: {
                    select: { refreshTokens: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({ status: 'success', data: users });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get detailed activity for a user
 * @route GET /api/admin/users/:id/activity
 */
exports.getUserActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.findUnique({
            where: { id },
            include: {
                refreshTokens: {
                    orderBy: { lastActive: 'desc' }
                },
                pushTokens: true
            }
        });

        if (!user) {
            return res.status(404).json({ status: 'fail', message: 'User not found' });
        }

        res.status(200).json({ status: 'success', data: user });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const authService = require('../../auth/auth/auth.service');

/**
 * @desc Block/Unblock user
 * @route PATCH /api/admin/users/:id/status
 */
exports.updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, blockReason } = req.body;

        if (!['active', 'blocked'].includes(status)) {
            return res.status(400).json({ status: 'fail', message: 'Invalid status' });
        }

        const user = await prisma.user.update({
            where: { id },
            data: { 
                status, 
                blockReason: status === 'blocked' ? blockReason : null 
            }
        });

        // If blocking, kill all sessions and send a real-time signal via FCM/Socket
        if (status === 'blocked') {
            await prisma.refreshToken.deleteMany({ where: { userId: id } });
            await authService.notifyOtherDevicesOfLogout(id);
        }

        res.status(200).json({ status: 'success', data: user });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
