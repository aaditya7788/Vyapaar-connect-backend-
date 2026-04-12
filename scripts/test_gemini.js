const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const GEMINI_KEY = process.env.Gemini_api_key;

async function listModels() {
  if (!GEMINI_KEY) {
    console.error("No API key found.");
    return;
  }
  
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    // There is no direct listModels in the main export for GenAI, 
    // Usually we use the REST API or just try common ones.
    
    // Let's try gemini-1.5-flash again with a simple prompt
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const result = await model.generateContent("Hello");
    console.log("Success with gemini-1.5-flash-latest:", result.response.text());
  } catch (error) {
    console.error("Failed with gemini-1.5-flash-latest:", error.message);
    
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Hello");
        console.log("Success with gemini-pro:", result.response.text());
    } catch (err2) {
        console.error("Failed with gemini-pro:", err2.message);
        
        try {
            const genAI = new GoogleGenerativeAI(GEMINI_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
            const result = await model.generateContent("Hello");
            console.log("Success with gemini-1.0-pro:", result.response.text());
        } catch (err3) {
            console.error("Failed with gemini-1.0-pro:", err3.message);
        }
    }
  }
}

listModels();
