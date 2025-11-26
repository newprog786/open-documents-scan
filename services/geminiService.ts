import { GoogleGenAI, Type } from "@google/genai";
import { DocumentData } from "../types";

// NOTE: In a real production app, handle keys securely. 
// For this client-side demo, we use the env var provided by the system.
const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const analyzeDocument = async (base64Image: string): Promise<{ title: string; category: string; summary: string }> => {
  if (!API_KEY) {
    throw new Error("API Key missing");
  }

  // Clean the base64 string if it contains the header
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64
            }
          },
          {
            text: `Analyze this scanned document image. 
            1. Identify the document category (e.g., Receipt, Invoice, Business Card, Handwritten Note, Contract, Whiteboard).
            2. Extract the most important text (OCR) to create a short summary.
            3. Generate a concise, descriptive title based on the content (e.g., "Home Depot Receipt", "Project Alpha Notes").`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "A short, descriptive filename for the document" },
            category: { type: Type.STRING, description: "The type of document" },
            summary: { type: Type.STRING, description: "Extracted text and summary of the content" }
          }
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return {
      title: result.title || "Untitled Scan",
      category: result.category || "General",
      summary: result.summary || "No text detected."
    };
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return {
      title: "Scanned Document",
      category: "Uncategorized",
      summary: "AI Analysis failed or offline."
    };
  }
};

export const translateText = async (text: string, targetLang: string, sourceLang: string = 'Auto'): Promise<string> => {
  if (!API_KEY) throw new Error("API Key missing");
  
  const prompt = `Translate the following text from ${sourceLang} to ${targetLang}. 
  Return only the translated text. Do not add any conversational preamble.
  
  Text:
  "${text}"`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text || "Translation empty.";
  } catch (error) {
    console.error("Translation Failed:", error);
    return "Translation failed. Please try again.";
  }
};