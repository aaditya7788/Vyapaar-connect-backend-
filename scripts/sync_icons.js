const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

// Load environment variables from root .env
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient();

// Configuration
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const TARGET_DIR = path.join(UPLOADS_DIR, 'shared/services');
const DELAY_MS = 1500; 

// Ensure target directory exists
if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
}

// API CONFIG
const SEARCH_API = "https://api-production.streamlinehq.com/v5/search-optimized";
const DOWNLOAD_API_BASE = "https://api-production.streamlinehq.com/v4/icons";

// GROQ CONFIG
const GROQ_KEY = process.env.GROQ_API_KEY;
let groq;
if (GROQ_KEY) {
    groq = new Groq({ apiKey: GROQ_KEY });
}

const slugify = (text) => (text || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');

/**
 * Uses Groq (Llama 3) to translate a name into a specific icon keyword
 * @param {string} name - The name to translate (Category or Subcategory)
 * @param {string} context - Optional context (Parent Category name)
 */
async function getBetterKeyword(name, context = '', retryCount = 0) {
    if (!groq) return name;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert at selecting icon keywords for a mobile marketplace. Return ONLY a single English word that describes an icon. No punctuation.'
                },
                {
                    role: 'user',
                    content: `Category/Context: "${context}". Item: "${name}". Best icon keyword:`
                }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            max_tokens: 10,
        });

        const text = chatCompletion.choices[0].message.content.trim().toLowerCase().replace(/[^a-z-]/g, '');
        console.log(`  ⚡ AI Keyword: "${name}" ${context ? `(in ${context})` : ''} -> "${text}"`);
        return text;
    } catch (error) {
        if (error.status === 429 && retryCount < 2) {
            console.log("  ⚠️ Groq Rate Limited. Retrying in 10s...");
            await new Promise(r => setTimeout(r, 10000));
            return getBetterKeyword(name, context, retryCount + 1);
        }
        return name;
    }
}

async function downloadIcon(hash, targetPath) {
    const url = `${DOWNLOAD_API_BASE}/${hash}/download?action=download&format=PNG&outlined=false&size=48&padding=0&reDownloadedFromExports=false`;

    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 10000
        });

        const writer = fs.createWriteStream(targetPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Verify file existence and size
        if (fs.existsSync(targetPath)) {
            const stats = fs.statSync(targetPath);
            if (stats.size > 0) return true;
        }
        return false;
    } catch (error) {
        // Even if axios fails, check if file was partially saved and is usable
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 100) {
            return true;
        }
        return false;
    }
}

async function processItem(item, type, contextName = '') {
    const originalName = item.name;
    const desiredName = slugify(originalName);
    const fileName = `${desiredName}.png`;
    const dbPath = `uploads/shared/services/${fileName}`;
    const absolutePath = path.join(TARGET_DIR, fileName);

    console.log(`\n🔄 Processing ${type}: "${originalName}" ${contextName ? `[Parent: ${contextName}]` : ''}`);

    try {
        // 1. Update DB Path Always
        const updateData = { icon: dbPath };
        if (type === 'category') {
            await prisma.category.update({ where: { id: item.id }, data: updateData });
        } else {
            await prisma.subcategory.update({ where: { id: item.id }, data: updateData });
        }

        // 2. AI Keyword Search
        const searchQuery = await getBetterKeyword(originalName, contextName);

        // 3. Search Streamline
        const searchRes = await axios.get(SEARCH_API, {
            params: {
                family: 'streamline-colors',
                query: searchQuery,
                familyName: 'Ultimate Colors'
            },
            timeout: 8000
        });

        const icons = searchRes.data.icons;
        if (!icons || icons.length === 0) {
            console.log(`  ⚠️ No icon found for "${searchQuery}"`);
            return;
        }

        const icon = icons[0];
        const hash = icon.hash;

        // 4. Download
        const success = await downloadIcon(hash, absolutePath);
        if (success) {
            console.log(`  ✅ File ready: ${dbPath}`);
        } else {
            console.log(`  ❌ Download check failed for "${originalName}"`);
        }

    } catch (error) {
        console.error(`  ❌ Error processing "${originalName}":`, error.message);
    }
}

async function main() {
    console.log("==================================================");
    console.log("🚀 NESTED CATEGORY-FIRST ICON SYNC (AI-POWERED)");
    console.log("==================================================");

    if (!GROQ_KEY) {
        console.warn("⚠️ GROQ_API_KEY missing in .env");
    }

    try {
        // 1. Fetch all Categories
        const categories = await prisma.category.findMany({
            include: { subcategories: true }
        });

        console.log(`📋 Found ${categories.length} Categories logic.`);

        for (const cat of categories) {
            // A. Process Category
            await processItem(cat, 'category');
            await new Promise(r => setTimeout(r, DELAY_MS));

            // B. Process Subcategories of this Category
            console.log(`   ∟ Processing ${cat.subcategories.length} Subcategories for "${cat.name}"...`);
            for (const sub of cat.subcategories) {
                await processItem(sub, 'subcategory', cat.name);
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        }

        console.log("\n==================================================");
        console.log("🏁 NESTED SYNC COMPLETE!");
        console.log("==================================================");
    } catch (error) {
        console.error("\n❌ FATAL ERROR:", error);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

main();
