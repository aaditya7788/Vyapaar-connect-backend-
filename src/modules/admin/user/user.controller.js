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
