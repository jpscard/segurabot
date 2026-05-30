import { IAIAssistantService } from '../domain/IAIAssistantService';
import { Message, Role } from '../domain/Chat';
import { GoogleGenAI } from '@google/genai';

let ai: GoogleGenAI | null = null;
let lastApiKey: string | null = null;

function getAI(instanceKey?: string) {
  const customKey = instanceKey || (typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null);
  const apiKey = customKey || (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : '') || import.meta.env.VITE_GEMINI_API_KEY || "";
  
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Using mock mode.");
    return null;
  }

  if (!ai || lastApiKey !== apiKey) {
    ai = new GoogleGenAI({ apiKey });
    lastApiKey = apiKey;
  }
  return ai;
}

export class GeminiAssistantService implements IAIAssistantService {
  private customApiKey?: string;
  private customModelName?: string;

  constructor(apiKey?: string, modelName?: string) {
    this.customApiKey = apiKey;
    this.customModelName = modelName;
  }

  async generateResponse(history: Message[], newPrompt: string, onChunk?: (chunk: string) => void): Promise<string> {
    try {
      const aiInstance = getAI(this.customApiKey);
      if (!aiInstance) {
        // Mock streaming
        const mockResponse = `**Modo de Demonstração (Gemini)**\nA chave da API Gemini não foi configurada.`;
        const chunks = mockResponse.split(' ');
        for (const chunk of chunks) {
          onChunk?.(chunk + ' ');
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        return mockResponse;
      }

      const contents = history.slice(0, -1).map(msg => ({
        role: msg.role === Role.USER ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      // Add the enriched prompt as the last user message
      contents.push({
        role: 'user',
        parts: [{ text: newPrompt }]
      });

      const activeModel = this.customModelName || (typeof window !== 'undefined' ? localStorage.getItem('gemini_model') || 'gemini-flash-latest' : 'gemini-flash-latest');

      const responseStream = await aiInstance.models.generateContentStream({
        model: activeModel,
        contents: contents,
        config: {
          temperature: 0.7,
        }
      });

      let fullText = "";
      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          onChunk?.(text);
        }
      }

      return fullText;
    } catch (error) {
      console.error("Gemini Error:", error);
      throw new Error("Falha ao se comunicar com o Google Gemini.");
    }
  }
}
