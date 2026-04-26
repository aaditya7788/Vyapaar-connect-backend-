require('dotenv').config();
const prisma = require('./src/db');
const { uploadToS3 } = require('./src/utils/s3Service');
const fs = require('fs');
const path = require('path');

const UPLOADS_BASE = path.join(__dirname, 'uploads');

async function migrateFile(relativePath) {
  if (!relativePath || !relativePath.startsWith('/uploads')) return null;

  try {
    const cleanPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    const absolutePath = path.join(__dirname, cleanPath);

    if (!fs.existsSync(absolutePath)) {
      console.log(`[SKIPPED] File not found: ${absolutePath}`);
      return null;
    }

    const fileContent = fs.readFileSync(absolutePath);
    const fileName = path.basename(absolutePath);
    
    // Maintain folder structure in S3 (strip 'uploads/' from prefix)
    const folder = path.dirname(cleanPath).replace(/^uploads[\/\\]?/, '').replace(/\\/g, '/');

    console.log(`[UPLOADING] ${relativePath} -> S3 folder: ${folder}`);
    const s3Url = await uploadToS3(fileContent, fileName, folder);
    return s3Url;
  } catch (error) {
    console.error(`[ERROR] Failed to migrate ${relativePath}:`, error.message);
    return null;
  }
}

async function startMigration() {
  console.log('🚀 Starting S3 Migration...');

  // 1. Migrate Users
  console.log('\n--- Migrating Users ---');
  const users = await prisma.user.findMany({ where: { avatar: { startsWith: '/uploads' } } });
  for (const user of users) {
    const newUrl = await migrateFile(user.avatar);
    if (newUrl) await prisma.user.update({ where: { id: user.id }, data: { avatar: newUrl } });
  }

  // 2. Migrate Categories
  console.log('\n--- Migrating Categories ---');
  const categories = await prisma.category.findMany({
    where: { OR: [{ icon: { startsWith: '/uploads' } }, { mascotImage: { startsWith: '/uploads' } }] }
  });
  for (const cat of categories) {
    const updates = {};
    if (cat.icon?.startsWith('/uploads')) updates.icon = await migrateFile(cat.icon);
    if (cat.mascotImage?.startsWith('/uploads')) updates.mascotImage = await migrateFile(cat.mascotImage);
    if (Object.keys(updates).length) await prisma.category.update({ where: { id: cat.id }, data: updates });
  }

  // 3. Migrate Shops
  console.log('\n--- Migrating Shops ---');
  const shops = await prisma.shop.findMany();
  for (const shop of shops) {
    const updates = {};
    if (shop.profileImage?.startsWith('/uploads')) updates.profileImage = await migrateFile(shop.profileImage);
    
    // Handle gallery array
    if (shop.gallery?.length) {
      const newGallery = [];
      for (const img of shop.gallery) {
        if (img.startsWith('/uploads')) {
          const url = await migrateFile(img);
          newGallery.push(url || img);
        } else {
          newGallery.push(img);
        }
      }
      updates.gallery = newGallery;
    }

    if (Object.keys(updates).length) await prisma.shop.update({ where: { id: shop.id }, data: updates });
  }

  // 4. Migrate Advertisements
  console.log('\n--- Migrating Ads ---');
  const ads = await prisma.advertisement.findMany({ where: { image: { startsWith: '/uploads' } } });
  for (const ad of ads) {
    const newUrl = await migrateFile(ad.image);
    if (newUrl) await prisma.advertisement.update({ where: { id: ad.id }, data: { image: newUrl } });
  }

  console.log('\n✅ Migration Finished!');
  process.exit(0);
}

startMigration();
