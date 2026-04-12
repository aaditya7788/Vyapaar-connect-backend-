const prisma = require('../../../db');
const { generateId, generateAccessToken } = require('../../../utils/auth.utils');
const communityService = require('../../common/community/community.service');

/**
 * Resolve Community ID from ID, slug or type
 */
const resolveCommunityId = async (input) => {
    if (!input) return null;
    const byId = await communityService.getCommunityById(input).catch(() => null);
    if (byId) return byId.id;
    const bySlug = await communityService.getCommunityBySlug(String(input).toLowerCase()).catch(() => null);
    return bySlug ? bySlug.id : null;
};

/**
 * Reverted to String Categorization Mapping
 */
const mapShopCategories = (shop) => {
    if (!shop) return shop;
    const result = { ...shop };
    
    // Ensure they are strings/arrays
    if (shop.category && typeof shop.category === 'object') {
        result.category = shop.category.name;
    }
    if (shop.subcategories && Array.isArray(shop.subcategories)) {
        result.subcategories = shop.subcategories;
    }
    
    // Add Labels for frontend
    result.categoryLabel = result.category;
    result.subcategoriesLabel = result.subcategories ? result.subcategories.join(', ') : '';
    
    return result;
};

/**
 * Resolve Category and Subcategory (No longer uses database lookups)
 */
const resolveCategories = async (categoryInput, subcategoriesInput) => {
    return {
        category: (categoryInput && typeof categoryInput === 'object') ? categoryInput.name : categoryInput,
        subcategories: Array.isArray(subcategoriesInput) ? subcategoriesInput : (subcategoriesInput ? [subcategoriesInput] : [])
    };
};

/**
 * Internal helper to ensure provider profile exists
 */
const _ensureProviderProfile = async (userId, tx) => {
    const user = await tx.user.findUnique({
        where: { id: userId },
        include: { providerProfile: true },
    });

    if (!user) throw new Error(`User with ID ${userId} not found`);

    let profile = user.providerProfile;
    if (!profile) {
        const providerId = await generateId('SP', 'providerId');
        profile = await tx.providerProfile.create({
            data: { userId, isActive: true },
        });
        
        if (!user.providerId) {
            await tx.user.update({
                where: { id: userId },
                data: { providerId },
            });
        }
    }
    return { profile, user };
};

/**
 * Internal helper to upgrade user role
 */
const _upgradeUserToProvider = async (userId, existingRoles, tx) => {
    if (!existingRoles.includes('provider')) {
        return await tx.user.update({
            where: { id: userId },
            data: { 
                roles: [...existingRoles, 'provider'],
                isProfileComplete: true
            },
        });
    }
    return null;
};

/**
 * Onboard User as Provider (Shop Creation Flow)
 * Decomposed for better maintainability.
 */
const onboardProvider = async (userId, shopData) => {
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Foundation: Profile & Identity
      const { profile, user } = await _ensureProviderProfile(userId, tx);

      // 2. Data Resolution
      const { category, subcategories } = await resolveCategories(
          shopData.category || shopData.categoryLabel, 
          shopData.subcategories || shopData.subcategory
      );

      // 3. Shop Creation
      const shop = await tx.shop.create({
        data: {
          name: shopData.name || "Untitled Shop",
          address: shopData.address || "Address Pending",
          experience: String(shopData.experience || ""),
          profileImage: shopData.profileImage || null,
          backgroundImages: shopData.backgroundImages || [],
          status: 'PENDING',
          providerProfileId: profile.id,
          category,
          subcategories,
          serviceType: shopData.serviceType || 'in-house',
          communityId: await resolveCommunityId(shopData.communityId || shopData.communityType || 'runwal'),
          serviceArea: shopData.serviceArea || "",
          businessSummary: shopData.businessSummary || "",
          whyChooseUs: shopData.whyChooseUs || "",
          tags: shopData.tags || [],
          latitude: shopData.latitude || null,
          longitude: shopData.longitude || null,
          workingHoursStart: shopData.workingHoursStart || '09:00 AM',
          workingHoursEnd: shopData.workingHoursEnd || '06:00 PM',
          workingDays: shopData.workingDays || ['mon', 'tue', 'wed', 'thu', 'fri'],
          facilities: shopData.facilities || [],
        },
      }).then(mapShopCategories);

      // 4. Role Evolution
      const upgradedUser = await _upgradeUserToProvider(userId, user.roles, tx);
      const activeUser = upgradedUser || user;

      // 5. Auth Fulfillment
      const accessToken = generateAccessToken(activeUser);

      return {
        message: 'Provider onboarding successful',
        accessToken,
        user: {
          id: activeUser.id,
          roles: activeUser.roles,
          providerId: activeUser.providerId,
        },
        shop,
      };
    });
  } catch (error) {
    console.error('[ONBOARDING ERROR]:', error.message);
    const err = new Error(error.message || 'Internal onboarding error');
    err.status = 500;
    throw err;
  }
};

/**
 * Handle Single Shop Creation
 */
const createShop = async (userId, shopData) => {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    const err = new Error('Provider profile not found. Please onboard first.');
    err.status = 404;
    throw err;
  }

  const { category, subcategories } = await resolveCategories(shopData.category, shopData.subcategories || shopData.subcategory);

  const shop = await prisma.shop.create({
    data: {
      name: shopData.name,
      address: shopData.address,
      experience: String(shopData.experience || ""),
      profileImage: shopData.profileImage,
      backgroundImages: shopData.backgroundImages || [],
      category,
      subcategories,
      serviceType: shopData.serviceType,
      communityId: await resolveCommunityId(shopData.communityId || shopData.communityType || 'runwal'),
      serviceArea: shopData.serviceArea,
      businessSummary: shopData.businessSummary,
      whyChooseUs: shopData.whyChooseUs,
      tags: shopData.tags || [],
      latitude: shopData.latitude || null,
      longitude: shopData.longitude || null,
      workingHoursStart: shopData.workingHoursStart,
      workingHoursEnd: shopData.workingHoursEnd,
      workingDays: shopData.workingDays || [],
      facilities: shopData.facilities || [],
      providerProfileId: profile.id,
    },
  }).then(mapShopCategories);

  return shop;
};

/**
 * Update existing shop
 * Refactored to use cleaner property merging.
 */
const updateShop = async (userId, shopId, shopData) => {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    const err = new Error('Provider profile not found.');
    err.status = 404;
    throw err;
  }

  const existingShop = await prisma.shop.findFirst({
    where: { id: shopId, providerProfileId: profile.id },
  });

  if (!existingShop) {
    const err = new Error('Shop not found or access denied');
    err.status = 404;
    throw err;
  }

  const { category, subcategories } = await resolveCategories(shopData.category, shopData.subcategories || shopData.subcategory);
      
  // Selective update - keep existing values if incoming is undefined
  const updateData = {};
  const fields = [
      'name', 'address', 'experience', 'profileImage', 'backgroundImages', 
      'serviceType', 'serviceArea', 'businessSummary', 'whyChooseUs', 
      'tags', 'latitude', 'longitude', 'workingHoursStart', 'workingHoursEnd', 
      'workingDays', 'facilities', 'status'
  ];

  fields.forEach(f => {
      if (shopData[f] !== undefined) updateData[f] = shopData[f];
  });

  // Special handling for derived/resolved fields
  if (category !== undefined) updateData.category = category;
  if (subcategories !== undefined) updateData.subcategories = subcategories;
  if (shopData.communityId || shopData.communityType) {
      updateData.communityId = await resolveCommunityId(shopData.communityId || shopData.communityType);
  }

  if (shopData.status) {
      updateData.rejectionReason = null;
  }

  const updatedShop = await prisma.shop.update({
    where: { id: shopId },
    data: updateData,
  }).then(mapShopCategories);

  return updatedShop;
};

/**
 * List all shops for a User
 */
const getShopsByUserId = async (userId) => {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
    include: { 
      shops: {
        include: { community: true }
      }
    },
  });

  if (!profile) return [];
  return profile.shops.map(mapShopCategories);
};

/**
 * Get Single Shop by ID
 */
const getShopById = async (shopId) => {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: {
      community: true,
      providerProfile: {
        include: {
          user: {
            select: { id: true, fullName: true, phone: true, email: true }
          }
        }
      },
      reviews: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { fullName: true, avatar: true }
          }
        }
      }
    }
  });
  if (!shop) throw new Error('Shop not found');
  return mapShopCategories(shop);
};

/**
 * Delete a shop
 */
const deleteShop = async (userId, shopId) => {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    const err = new Error('Provider profile not found.');
    err.status = 404;
    throw err;
  }

  const shop = await prisma.shop.findFirst({
    where: { id: shopId, providerProfileId: profile.id },
  });

  if (!shop) {
    const err = new Error('Shop not found or access denied');
    err.status = 404;
    throw err;
  }

  await prisma.shop.delete({
    where: { id: shopId },
  });

  return { message: 'Shop deleted' };
};

/**
 * Update Shop Status (VERIFIED, REJECTED, etc)
 */
const updateShopStatus = async (userId, shopId, { status, rejectionReason }) => {
  // Check if store/user is admin if needed, but here we assume user owns shop or admin
  const shop = await prisma.shop.update({
    where: { id: shopId },
    data: {
      status,
      rejectionReason: status === 'REJECTED' ? rejectionReason : null,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
    },
  });
  return mapShopCategories(shop);
};

module.exports = {
  onboardProvider,
  createShop,
  getShopsByUserId,
  getShopById,
  updateShop,
  updateShopStatus,
  deleteShop,
  getProviderDashboardStats,
};

/**
 * Get aggregated dashboard stats for a specific shop
 */
async function getProviderDashboardStats(userId, shopId) {
  // Ensure the shop belongs to the user
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    const err = new Error('Provider profile not found');
    err.status = 404;
    throw err;
  }

  const shop = await prisma.shop.findFirst({
    where: { id: shopId, providerProfileId: profile.id },
  });

  if (!shop) {
    const err = new Error('Shop not found or access denied');
    err.status = 404;
    throw err;
  }

  // Calculate Today's Earnings (Completed bookings today)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const completedToday = await prisma.booking.aggregate({
    where: {
      shopId,
      status: 'COMPLETED',
      updatedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    _sum: {
      totalAmount: true,
    },
  });

  // Count Active Jobs (Confirmed, Arrived, In Progress)
  const activeJobsCount = await prisma.booking.count({
    where: {
      shopId,
      status: {
        in: ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS'],
      },
    },
  });

  // Count Pending Requests
  const pendingRequestsCount = await prisma.booking.count({
    where: {
      shopId,
      status: 'PENDING',
    },
  });

  // Get Wallet Balance
  const wallet = await prisma.userCredits.findUnique({
    where: { userId },
  });

  // Calculate Yesterday's Earnings (Completed bookings yesterday)
  const startOfYesterday = new Date();
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  startOfYesterday.setHours(0, 0, 0, 0);
  const endOfYesterday = new Date();
  endOfYesterday.setDate(endOfYesterday.getDate() - 1);
  endOfYesterday.setHours(23, 59, 59, 999);

  const completedYesterday = await prisma.booking.aggregate({
    where: {
      shopId,
      status: 'COMPLETED',
      updatedAt: {
        gte: startOfYesterday,
        lte: endOfYesterday,
      },
    },
    _sum: {
      totalAmount: true,
    },
  });

  // Get Recent Reviews
  const reviews = await prisma.review.findMany({
    where: { shopId },
    include: {
      user: {
        select: {
          fullName: true,
          avatar: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return {
    todayEarnings: completedToday._sum.totalAmount || 0,
    yesterdayEarnings: completedYesterday._sum.totalAmount || 0,
    activeJobs: activeJobsCount,
    pendingRequests: pendingRequestsCount,
    walletBalance: wallet?.balance || 0,
    rating: shop.averageRating || 0,
    reviewCount: shop.reviewCount || 0,
    recentReviews: reviews.map(r => ({
      id: r.id,
      user: r.user.fullName,
      image: r.user.avatar,
      rating: r.overallRating,
      content: r.comment,
      date: new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    })),
  };
}
