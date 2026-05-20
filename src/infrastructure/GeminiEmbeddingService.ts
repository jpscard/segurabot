import { IEmbeddingService } from '../domain/IEmbeddingService';
import { GoogleGenAI } from '@google/genai';

let ai: GoogleGenAI | null = null;
let lastApiKey: string | null = null;

function getAI() {
  const customKey = typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;
  const apiKey = customKey || import.meta.env.VITE_GEMINI_API_KEY || "";
  
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Using mock mode for embeddings.");
    return null;
  }

  if (!ai || lastApiKey !== apiKey) {
    ai = new GoogleGenAI({ apiKey });
    lastApiKey = apiKey;
  }
  return ai;
}

export class GeminiEmbeddingService implements IEmbeddingService {
  async generateEmbedding(text: string): Promise<number[]> {
    const aiInstance = getAI();
    if (!aiInstance) {
      // Return a mock vector (768 dimensions is typical for gemini-embedding-001/002)
      // We generate a deterministic mock vector based on the text length and character codes
      // so that identical queries get identical mock vectors.
      const mockVector = new Array(768).fill(0);
      for (let i = 0; i < mockVector.length; i++) {
        const charCode = text.charCodeAt(i % text.length) || 0;
        mockVector[i] = Math.sin(charCode + i);
      }
      return mockVector;
    }

    try {
      const response = await aiInstance.models.embedContent({
        model: 'gemini-embedding-2',
        contents: text,
      });

      if (response.embeddings && response.embeddings.length > 0) {
        return response.embeddings[0].values;
      }
      throw new Error("No embeddings returned from Gemini API");
    } catch (error) {
      console.error("Error generating embedding with gemini-embedding-2:", error);
      
      // Fallback to gemini-embedding-001 if gemini-embedding-2 fails
      try {
        console.log("Attempting fallback to gemini-embedding-001...");
        const fallbackResponse = await aiInstance.models.embedContent({
          model: 'gemini-embedding-001',
          contents: text,
        });
        if (fallbackResponse.embeddings && fallbackResponse.embeddings.length > 0) {
          return fallbackResponse.embeddings[0].values;
        }
      } catch (fallbackError) {
        console.error("Fallback to gemini-embedding-001 also failed:", fallbackError);
      }
      
      throw error;
    }
  }
}
