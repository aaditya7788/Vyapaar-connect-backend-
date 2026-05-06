const prisma = require('../../../db');

/**
 * TITLE: Customer Address Controller
 * DESCRIPTION: Manages user delivery/service addresses, including geocoding validation, 
 * default address selection, and CRUD operations for personal locations.
 */

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
        const { label, name, icon, address, area, landmark, latitude, longitude, isDefault } = req.body;

        // 🚀 UPSERT LOGIC: If an address with this label already exists, update it instead of creating a duplicate
        const existingAddress = await prisma.userAddress.findFirst({
            where: { 
                userId: req.user.id,
                label: label 
            }
        });

        // If this is set as default, unset others first
        if (isDefault) {
            await prisma.userAddress.updateMany({
                where: { userId: req.user.id },
                data: { isDefault: false }
            });
        }

        if (existingAddress) {
            const updated = await prisma.userAddress.update({
                where: { id: existingAddress.id },
                data: {
                    name,
                    icon: icon || 'home',
                    address,
                    area,
                    landmark,
                    latitude: latitude ? parseFloat(latitude) : null,
                    longitude: longitude ? parseFloat(longitude) : null,
                    isDefault: isDefault || false
                }
            });
            return res.status(200).json({ status: 'success', data: updated, message: 'Address updated' });
        }

        const newAddress = await prisma.userAddress.create({
            data: {
                userId: req.user.id,
                label,
                name,
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
        const { label, name, icon, address, area, landmark, latitude, longitude, isDefault } = req.body;

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
                name,
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

        // Deletion is now safe because address snapshots in Booking model (addressData) 
        // preserve history even if the source address is deleted.
        // The foreign key is set to onDelete: SetNull in schema.prisma.

        await prisma.userAddress.delete({ where: { id } });
        res.status(200).json({ status: 'success', message: 'Address deleted' });
    } catch (error) {
        console.error('[DELETE ADDRESS ERROR]:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = {
    getAddresses,
    createAddress,
    updateAddress,
    deleteAddress
};
