const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const sharp = require('sharp');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient();

// Configuration
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const PNG_DIR = path.join(UPLOADS_DIR, 'shared/services');
const SVG_DIR = path.join(UPLOADS_DIR, 'mockservicesicons');
const DELAY_MS = 1500; 

// Ensure directories exist
[PNG_DIR, SVG_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Icons8 API Endpoints
const ICONS8_SEARCH = "https://search-app.icons8.com/api/iconsets/v7/search";
const ICONS8_DETAIL = "https://api-icons.icons8.com/siteApi/icons/icon";

// Groq Config
const GROQ_KEY = process.env.GROQ_API_KEY;
let groq;
if (GROQ_KEY) {
    groq = new Groq({ apiKey: GROQ_KEY });
}

const slugify = (text) => (text || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');

/**
 * AI Keyword Translation (Nested context)
 */
async function getBetterKeyword(name, context = '', retryCount = 0) {
    if (!groq) return name;
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'Return ONLY 1 or 2 word English descriptive keyword for an icon. No punctuation. Format: single-word.'
                },
                {
                    role: 'user',
                    content: `Service: "${name}" (Category: ${context}). Best icon term:`
                }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            max_tokens: 10,
        });
        return chatCompletion.choices[0].message.content.trim().toLowerCase().replace(/[^a-z-]/g, '');
    } catch (error) {
        if (error.status === 429 && retryCount < 2) {
            await new Promise(r => setTimeout(r, 10000));
            return getBetterKeyword(name, context, retryCount + 1);
        }
        return name;
    }
}

/**
 * Process SVG: Decode -> Color Re-color -> Save SVG -> Resize -> PNG
 */
async function processIconFiles(base64Svg, svgPath, pngPath) {
    try {
        // 1. Decode Base64
        let svgBuffer = Buffer.from(base64Svg, 'base64').toString('utf8');

        // 2. Color Refinement (#8d6c9f -> #000)
        svgBuffer = svgBuffer.replace(/#8d6c9f/gi, '#000000');
        
        // 3. Save SVG to mockservicesicons
        fs.writeFileSync(svgPath, svgBuffer);

        // 4. Sharp Conversion to PNG (100x100)
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

async function processIcons8(item, type, contextName = '') {
    const originalName = item.name;
    const desiredName = slugify(originalName);
    
    const pngName = `${desiredName}.png`;
    const svgName = `${desiredName}.svg`;
    
    // DB stores the PNG path in shared/services
    const dbPath = `uploads/shared/services/${pngName}`;
    
    const fullPngPath = path.join(PNG_DIR, pngName);
    const fullSvgPath = path.join(SVG_DIR, svgName);

    console.log(`\n🔄 Processing ${type}: "${originalName}"`);

    try {
        // A. Get Search Term
        const searchTerm = await getBetterKeyword(originalName, contextName);
        console.log(`  🔍 Term: "${searchTerm}"`);

        // B. Search Icons8
        const searchRes = await axios.get(ICONS8_SEARCH, {
            params: {
                style: 'dusk',
                term: searchTerm,
                amount: 1
            }
        });

        if (!searchRes.data.icons || searchRes.data.icons.length === 0) {
            console.log(`  ⚠️ No Icons8 result for "${searchTerm}"`);
            return;
        }

        const iconId = searchRes.data.icons[0].id;
        console.log(`  🆔 Icon ID: ${iconId}`);

        // C. Get Icon Detail (SVG)
        const detailRes = await axios.get(ICONS8_DETAIL, {
            params: { id: iconId, svg: true }
        });

        if (!detailRes.data.success || !detailRes.data.icon.svg) {
            console.log(`  ❌ Failed to fetch SVG for ID ${iconId}`);
            return;
        }

        // D. Process & Save
        const success = await processIconFiles(detailRes.data.icon.svg, fullSvgPath, fullPngPath);

        if (success) {
            // E. Update DataBase
            if (type === 'category') {
                await prisma.category.update({ where: { id: item.id }, data: { icon: dbPath } });
            } else {
                await prisma.subcategory.update({ where: { id: item.id }, data: { icon: dbPath } });
            }
            console.log(`  ✅ Saved & DB Linked: ${dbPath}`);
            console.log(`  📂 SVG Archived: ${fullSvgPath}`);
        }

    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
    }
}

async function main() {
    console.log("==================================================");
    console.log("🎨 ICONS8 AUTOMATION (DUSK STYLE + CUSTOM COLOR)");
    console.log("==================================================");

    try {
        const categories = await prisma.category.findMany({ include: { subcategories: true } });

        for (const cat of categories) {
            await processIcons8(cat, 'category');
            await new Promise(r => setTimeout(r, DELAY_MS));

            for (const sub of cat.subcategories) {
                await processIcons8(sub, 'subcategory', cat.name);
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        }

        console.log("\n==================================================");
        console.log("🏁 ICONS8 SYNC COMPLETE!");
        console.log("==================================================");
    } catch (err) {
        console.error("FATAL:", err);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

main();
