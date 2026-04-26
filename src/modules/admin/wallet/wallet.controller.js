const prisma = require('../../../db');

/**
 * @desc Get all credit plans
 */
exports.getAllPlans = async (req, res) => {
    try {
        const plans = await prisma.creditPlan.findMany({
            orderBy: { credits: 'asc' }
        });
        res.status(200).json({ status: 'success', data: plans });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Create a new credit plan
 */
exports.createPlan = async (req, res) => {
    try {
        // Define specifically which fields we allow
        const allowedFields = ['id', 'credits', 'price', 'label', 'popular', 'savings', 'validityDays', 'isActive', 'startDate', 'endDate'];
        const data = {};

        // Only move allowed fields into the data object
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                data[key] = req.body[key];
            }
        });
        
        // Type casting for Prisma safety
        if (data.credits) data.credits = parseInt(data.credits);
        if (data.price) data.price = parseFloat(data.price);
        if (data.validityDays) data.validityDays = parseInt(data.validityDays);

        const plan = await prisma.creditPlan.create({
            data: data
        });
        res.status(201).json({ status: 'success', data: plan });
    } catch (error) {
        console.error('[PLAN CREATE ERROR]:', error);
        res.status(400).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Update a credit plan
 */
exports.updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Define specifically which fields we allow to be updated
        const allowedFields = ['credits', 'price', 'label', 'popular', 'savings', 'validityDays', 'isActive', 'startDate', 'endDate'];
        const updateData = {};

        // Only move allowed fields into the update object
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                updateData[key] = req.body[key];
            }
        });

        // Type casting for Prisma safety
        if (updateData.credits !== undefined) updateData.credits = parseInt(updateData.credits);
        if (updateData.price !== undefined) updateData.price = parseFloat(updateData.price);
        if (updateData.validityDays !== undefined) updateData.validityDays = parseInt(updateData.validityDays);

        const plan = await prisma.creditPlan.update({
            where: { id },
            data: updateData
        });
        res.status(200).json({ status: 'success', data: plan });
    } catch (error) {
        console.error('[PLAN UPDATE ERROR]:', error);
        res.status(400).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Delete a credit plan
 */
exports.deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.creditPlan.delete({ where: { id } });
        res.status(200).json({ status: 'success', message: 'Plan deleted' });
    } catch (error) {
        res.status(400).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get all coupons
 */
exports.getAllCoupons = async (req, res) => {
    try {
        const coupons = await prisma.coupon.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json({ status: 'success', data: coupons });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Create a new coupon
 */
exports.createCoupon = async (req, res) => {
    try {
        const coupon = await prisma.coupon.create({
            data: {
                ...req.body,
                code: req.body.code.toUpperCase(),
                type: req.body.type ? req.body.type.toUpperCase() : 'PERCENT'
            }
        });
        res.status(201).json({ status: 'success', data: coupon });
    } catch (error) {
        res.status(400).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Update a coupon
 */
exports.updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await prisma.coupon.update({
            where: { id },
            data: {
                ...req.body,
                code: req.body.code ? req.body.code.toUpperCase() : undefined,
                type: req.body.type ? req.body.type.toUpperCase() : undefined
            }
        });
        res.status(200).json({ status: 'success', data: coupon });
    } catch (error) {
        res.status(400).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Delete a coupon
 */
exports.deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.coupon.delete({ where: { id } });
        res.status(200).json({ status: 'success', message: 'Coupon deleted' });
    } catch (error) {
        res.status(400).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get all global settings
 */
exports.getAllSettings = async (req, res) => {
    try {
        const settings = await prisma.globalSettings.findMany();
        res.status(200).json({ status: 'success', data: settings });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Update or create a global setting
 */
exports.updateSetting = async (req, res) => {
    try {
        const { key, value, type, label } = req.body;
        const setting = await prisma.globalSettings.upsert({
            where: { key },
            update: { value, type, label },
            create: { key, value, type, label }
        });
        res.status(200).json({ status: 'success', data: setting });
    } catch (error) {
        res.status(400).json({ status: 'error', message: error.message });
    }
};


