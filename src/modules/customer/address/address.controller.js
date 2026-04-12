const prisma = require('../../../db');

/**
 * Get all addresses of the logged-in user
 */
const getAddresses = async (req, res) => {
    try {
        const addresses = await prisma.userAddress.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({ status: 'success', data: addresses });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * Create a new address for the user
 */
const createAddress = async (req, res) => {
    try {
        const { label, icon, address, area, landmark, latitude, longitude, isDefault } = req.body;

        // If this is set as default, unset others first
        if (isDefault) {
            await prisma.userAddress.updateMany({
                where: { userId: req.user.id },
                data: { isDefault: false }
            });
        }

        const newAddress = await prisma.userAddress.create({
            data: {
                userId: req.user.id,
                label,
                icon: icon || 'home',
                address,
                area,
                landmark,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                isDefault: isDefault || false
            }
        });

        res.status(201).json({ status: 'success', data: newAddress });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * Update an existing address
 */
const updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const { label, icon, address, area, landmark, latitude, longitude, isDefault } = req.body;

        // Verify ownership
        const existing = await prisma.userAddress.findUnique({ where: { id } });
        if (!existing || existing.userId !== req.user.id) {
            return res.status(403).json({ status: 'fail', message: 'Unauthorized' });
        }

        if (isDefault) {
            await prisma.userAddress.updateMany({
                where: { userId: req.user.id },
                data: { isDefault: false }
            });
        }

        const updated = await prisma.userAddress.update({
            where: { id },
            data: {
                label,
                icon,
                address,
                area,
                landmark,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                isDefault
            }
        });

        res.status(200).json({ status: 'success', data: updated });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * Delete an address
 */
const deleteAddress = async (req, res) => {
    try {
        const { id } = req.params;

        // Verify ownership
        const existing = await prisma.userAddress.findUnique({ where: { id } });
        if (!existing || existing.userId !== req.user.id) {
            return res.status(403).json({ status: 'fail', message: 'Unauthorized' });
        }

        await prisma.userAddress.delete({ where: { id } });
        res.status(200).json({ status: 'success', message: 'Address deleted' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = {
    getAddresses,
    createAddress,
    updateAddress,
    deleteAddress
};
