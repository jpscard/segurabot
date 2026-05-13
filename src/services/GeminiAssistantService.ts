import { IAIAssistantService } from '../types/IAIAssistantService';
import { Message } from '../types/Chat';
import { GoogleGenerativeAI } from '@google/generative-ai';

// You would typically pass the API key via constructor or env variables
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || 'dummy_key');

export class GeminiAssistantService implements IAIAssistantService {
  async generateResponse(history: Message[], newPrompt: string): Promise<string> {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      
      // Convert our history to Gemini's format if needed
      // For simplicity in this adapter, we just send the new prompt
      // In a real scenario, you'd map the `history` array to Gemini's `contents` array
      
      const result = await model.generateContent(newPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("Gemini Error:", error);
      throw new Error("Falha ao se comunicar com o Google Gemini.");
    }
  }
}
