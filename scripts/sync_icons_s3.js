const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const sharp = require('sharp');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const env = require('../src/config/env');

const prisma = new PrismaClient();

// S3 Configuration
const s3Client = new S3Client({
    region: env.AWS.REGION,
    credentials: {
        accessKeyId: env.AWS.ACCESS_KEY_ID,
        secretAccessKey: env.AWS.SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = env.AWS.S3_BUCKET_NAME;
const S3_BASE_URL = env.AWS.S3_BASE_URL;

// Icons8 API Endpoints
const ICONS8_SEARCH = "https://search-app.icons8.com/api/iconsets/v7/search";
const ICONS8_DETAIL = "https://api-icons.icons8.com/siteApi/icons/icon";

const DELAY_MS = 1000; 

const slugify = (text) => (text || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');

/**
 * Uploads a buffer to S3 and returns the public URL
 */
async function uploadBufferToS3(buffer, key, mimetype) {
    try {
        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: key,
                Body: buffer,
                ContentType: mimetype,
            },
        });

        await upload.done();
        return `${S3_BASE_URL}/${key}`.replace(/\/+/g, '/').replace(':/', '://');
    } catch (error) {
        console.error(`     ❌ S3 Upload Error: ${error.message}`);
        return null;
    }
}

/**
 * Process SVG: Decode -> Color Re-color -> Convert to PNG Buffer
 */
async function processIcon(base64Svg) {
    try {
        let svgString = Buffer.from(base64Svg, 'base64').toString('utf8');
        // Apply color correction (as requested in the original script)
        svgString = svgString.replace(/#8d6c9f/gi, '#000000');
        
        const svgBuffer = Buffer.from(svgString);

        const pngBuffer = await sharp(svgBuffer)
            .resize(256, 256) // Increased quality from 100 to 256
            .png()
            .toBuffer();

        return { svgBuffer, pngBuffer };
    } catch (error) {
        console.error(`     ❌ Image Processing Error: ${error.message}`);
        return null;
    }
}

async function syncItem(item, type) {
    const originalName = item.name;
    const desiredName = slugify(originalName);
    
    // Icons8 search term (using the name directly)
    const searchTerm = originalName.replace(/[^a-zA-Z0-9 ]/g, ' '); 

    const pngName = `${desiredName}.png`;
    const svgName = `${desiredName}.svg`;
    
    // S3 Keys (Standarized to always start with uploads/)
    const pngKey = `uploads/shared/services/${pngName}`;
    const svgKey = `uploads/mockservicesicons/${svgName}`;

    console.log(`\n🔄 Syncing ${type}: "${originalName}"`);

    try {
        // ... (API lookups remain the same) ...
        const searchRes = await axios.get(ICONS8_SEARCH, {
            params: {
                ai: 'true',
                style: 'dusk',
                term: searchTerm,
                amount: 1,
                isOuch: 'true'
            }
        });

        if (!searchRes.data.icons || searchRes.data.icons.length === 0) {
            console.log(`  ⚠️ No result for "${searchTerm}"`);
            return;
        }

        const iconId = searchRes.data.icons[0].id;
        console.log(`  🆔 Icon found: ${iconId}`);

        // 2. Get SVG Detail
        const detailRes = await axios.get(ICONS8_DETAIL, {
            params: { id: iconId, svg: true }
        });

        if (!detailRes.data.success) {
            console.log(`  ❌ Failed to fetch detail for ${iconId}`);
            return;
        }

        // 3. Process & Upload
        const processed = await processIcon(detailRes.data.icon.svg);

        if (processed) {
            console.log(`  📤 Uploading to S3...`);
            
            // Upload buffers
            await uploadBufferToS3(processed.pngBuffer, pngKey, 'image/png');
            await uploadBufferToS3(processed.svgBuffer, svgKey, 'image/svg+xml');

            // FIX: Use the pngKey directly for the DB path (just add leading slash)
            // This prevents the "uploads/uploads" double prefixing issue
            const dbPath = `/${pngKey}`.replace(/\/+/g, '/');

            if (type === 'category') {
                await prisma.category.update({ where: { id: item.id }, data: { icon: dbPath } });
            } else {
                await prisma.subcategory.update({ where: { id: item.id }, data: { icon: dbPath } });
            }
            console.log(`  ✅ Complete: ${dbPath}`);
        }

    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
    }
}

async function main() {
    console.log("==================================================");
    console.log("🎨 ICONS8 S3 SYNC (AI SEARCH ENABLED)");
    console.log("==================================================");

    try {
        // Check S3 Config
        if (!BUCKET_NAME || !env.AWS.ACCESS_KEY_ID) {
            throw new Error("AWS S3 credentials missing from .env");
        }

        const categories = await prisma.category.findMany({ 
            include: { subcategories: true } 
        });

        console.log(`📦 Found ${categories.length} categories to process.`);

        for (const cat of categories) {
            await syncItem(cat, 'category');
            await new Promise(r => setTimeout(r, DELAY_MS));

            for (const sub of cat.subcategories) {
                await syncItem(sub, 'subcategory');
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        }

        console.log("\n==================================================");
        console.log("🏁 S3 SYNC COMPLETE!");
        console.log("==================================================");
    } catch (err) {
        console.error("FATAL ERROR:", err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
