const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const GEMINI_KEY = process.env.Gemini_api_key;

async function listModels() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_KEY}`;
        const response = await axios.get(url);
        console.log("Available Models:");
        response.data.models.forEach(m => console.log(`- ${m.name}`));
    } catch (error) {
        console.error("Failed to list models:", error.response ? error.response.data : error.message);
    }
}

listModels();
