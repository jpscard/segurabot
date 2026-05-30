import { IAIAssistantService } from '../domain/IAIAssistantService';
import { Message } from '../domain/Chat';
import { db, isFirebaseRestricted } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { GeminiAssistantService } from './GeminiAssistantService';
import { OllamaAssistantService } from './OllamaAssistantService';

export class DynamicAssistantService implements IAIAssistantService {
  async generateResponse(history: Message[], newPrompt: string, onChunk?: (chunk: string) => void): Promise<string> {
    let provider = 'gemini';
    let geminiApiKey = '';
    let geminiModel = 'gemini-flash-latest';
    let ollamaModel = 'llama3';
    let ollamaBaseUrl = 'http://localhost:11434';

    const loadLocalFallbacks = () => {
      if (typeof window !== 'undefined') {
        provider = localStorage.getItem('ai_provider') || 'gemini';
        geminiApiKey = localStorage.getItem('gemini_api_key') || '';
        geminiModel = localStorage.getItem('gemini_model') || 'gemini-flash-latest';
        ollamaModel = localStorage.getItem('ollama_model') || 'llama3';
        ollamaBaseUrl = localStorage.getItem('ollama_base_url') || 'http://localhost:11434';
      }
    };

    if (isFirebaseRestricted) {
      loadLocalFallbacks();
    } else {
      try {
        // Buscar configurações do Firestore
        const docRef = doc(db, 'settings', 'ia_config');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.provider) provider = data.provider;
          if (data.geminiApiKey) geminiApiKey = data.geminiApiKey;
          if (data.geminiModel) geminiModel = data.geminiModel;
          if (data.ollamaModel) ollamaModel = data.ollamaModel;
          if (data.ollamaBaseUrl) ollamaBaseUrl = data.ollamaBaseUrl;
        } else {
          loadLocalFallbacks();
        }
      } catch (error) {
        console.warn("Erro ao buscar ia_config no Firestore, usando fallbacks locais:", error);
        loadLocalFallbacks();
      }
    }

    try {
      if (provider === 'ollama') {
        try {
          console.log(`[DynamicAssistantService] Tentando conexão com Ollama em ${ollamaBaseUrl} usando modelo ${ollamaModel}...`);
          const ollamaService = new OllamaAssistantService(ollamaModel, ollamaBaseUrl);
          return await ollamaService.generateResponse(history, newPrompt, onChunk);
        } catch (ollamaError) {
          console.error("[DynamicAssistantService] Erro ao chamar Ollama. Iniciando fallback automático para o Gemini:", ollamaError);
          // Fallback silencioso para o Gemini
          const geminiService = new GeminiAssistantService(geminiApiKey, geminiModel);
          return await geminiService.generateResponse(history, newPrompt, onChunk);
        }
      } else {
        const geminiService = new GeminiAssistantService(geminiApiKey, geminiModel);
        return await geminiService.generateResponse(history, newPrompt, onChunk);
      }
    } catch (globalAiError) {
      console.error("[DynamicAssistantService] Erro crítico no provedor selecionado:", globalAiError);
      throw globalAiError;
    }
  }
}
