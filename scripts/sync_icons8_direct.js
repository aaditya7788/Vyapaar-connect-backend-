const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const prisma = new PrismaClient();

// Configuration
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const PNG_DIR = path.join(UPLOADS_DIR, 'shared/services');
const SVG_DIR = path.join(UPLOADS_DIR, 'mockservicesicons');
const DELAY_MS = 1000; 

// Ensure directories exist
[PNG_DIR, SVG_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Icons8 API Endpoints
const ICONS8_SEARCH = "https://search-app.icons8.com/api/iconsets/v7/search";
const ICONS8_DETAIL = "https://api-icons.icons8.com/siteApi/icons/icon";

const slugify = (text) => (text || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');

/**
 * Process SVG: Decode -> Color Re-color -> Save SVG -> Resize -> PNG
 */
async function processIconFiles(base64Svg, svgPath, pngPath) {
    try {
        let svgBuffer = Buffer.from(base64Svg, 'base64').toString('utf8');
        svgBuffer = svgBuffer.replace(/#8d6c9f/gi, '#000000');
        
        fs.writeFileSync(svgPath, svgBuffer);

        await sharp(Buffer.from(svgBuffer))
            .resize(100, 100)
            .png()
            .toFile(pngPath);

        return true;
    } catch (error) {
        console.error(`     ❌ Image Processing Error: ${error.message}`);
        return false;
    }
}

async function syncItem(item, type) {
    const originalName = item.name;
    const desiredName = slugify(originalName);
    
    // Icons8 search term (using the name directly - now using AI=true in URL)
    const searchTerm = originalName.replace(/[^a-zA-Z0-9 ]/g, ' '); 

    const pngName = `${desiredName}.png`;
    const svgName = `${desiredName}.svg`;
    
    const dbPath = `uploads/shared/services/${pngName}`;
    const fullPngPath = path.join(PNG_DIR, pngName);
    const fullSvgPath = path.join(SVG_DIR, svgName);

    console.log(`\n🔄 Syncing ${type}: "${originalName}"`);

    try {
        // 1. Search Icons8 with AI=true
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

        // 3. Process & Save
        const success = await processIconFiles(detailRes.data.icon.svg, fullSvgPath, fullPngPath);

        if (success) {
            // Update DB
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
    console.log("🎨 ICONS8 DIRECT SYNC (AI SEARCH ENABLED)");
    console.log("==================================================");

    try {
        const categories = await prisma.category.findMany({ include: { subcategories: true } });

        for (const cat of categories) {
            await syncItem(cat, 'category');
            await new Promise(r => setTimeout(r, DELAY_MS));

            for (const sub of cat.subcategories) {
                await syncItem(sub, 'subcategory');
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        }

        console.log("\n==================================================");
        console.log("🏁 DIRECT SYNC COMPLETE!");
        console.log("==================================================");
    } catch (err) {
        console.error("FATAL ERROR:", err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
