const prisma = require('../../../db');

/**
 * @desc Get all bookings across the platform with advanced filtering
 * @route GET /api/admin/bookings/list
 */
exports.listBookings = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status, 
            q,
            startDate,
            endDate
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};

        // Status Filter
        if (status && status !== 'All') {
            where.status = status;
        }

        // Date Range Filter
        if (startDate || endDate) {
            where.scheduledDate = {};
            if (startDate) where.scheduledDate.gte = startDate;
            if (endDate) where.scheduledDate.lte = endDate;
        }

        // Unified Search
        if (q) {
            where.OR = [
                { displayId: { contains: q, mode: 'insensitive' } },
                { 
                    shop: { 
                        OR: [
                            { name: { contains: q, mode: 'insensitive' } },
                            { 
                                providerProfile: { 
                                    user: {
                                        OR: [
                                            { fullName: { contains: q, mode: 'insensitive' } },
                                            { phone: { contains: q, mode: 'insensitive' } },
                                            { email: { contains: q, mode: 'insensitive' } }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    user: {
                        OR: [
                            { fullName: { contains: q, mode: 'insensitive' } },
                            { phone: { contains: q, mode: 'insensitive' } },
                            { email: { contains: q, mode: 'insensitive' } }
                        ]
                    }
                }
            ];
        }

        const [bookings, total] = await Promise.all([
            prisma.booking.findMany({
                where,
                include: {
                    shop: {
                        select: { 
                            id: true,
                            name: true,
                            providerProfile: {
                                include: {
                                    user: {
                                        select: {
                                            id: true,
                                            fullName: true,
                                            phone: true,
                                            email: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    user: {
                        select: {
                            id: true,
                            fullName: true,
                            phone: true,
                            email: true
                        }
                    },
                    items: {
                        include: {
                            service: {
                                select: { name: true, unit: true, image: true }
                            }
                        }
                    },
                    address: true
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take
            }),
            prisma.booking.count({ where })
        ]);

        res.status(200).json({
            status: 'success',
            data: bookings.map(b => ({
                id: b.id,
                displayId: b.displayId,
                title: b.shop.name,
                date: b.scheduledDate,
                time: b.scheduledTime,
                status: b.status,
                amount: b.totalAmount,
                payment: b.paymentStatus || 'PENDING', // Default if missing
                customer: {
                    id: b.user.id,
                    name: b.user.fullName,
                    phone: b.user.phone,
                    email: b.user.email
                },
                shop: {
                    id: b.shop.id,
                    name: b.shop.name,
                    owner: b.shop.providerProfile.user
                },
                address: b.address ? `${b.address.name || ''} ${b.address.address}, ${b.address.area || ''}`.trim() : 'N/A',
                items: b.items.map(item => ({
                    id: item.id,
                    name: item.service.name,
                    quantity: item.quantity,
                    unit: item.service.unit,
                    price: item.price,
                    image: item.service.image
                }))
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / take)
            }
        });
    } catch (error) {
        console.error('Admin global booking fetch error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};
