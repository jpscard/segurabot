import { IEmbeddingService } from '../domain/IEmbeddingService';
import { GeminiEmbeddingService } from './GeminiEmbeddingService';
import { OllamaEmbeddingService } from './OllamaEmbeddingService';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

export class DynamicEmbeddingService implements IEmbeddingService {
  async generateEmbedding(text: string): Promise<number[]> {
    let provider = 'gemini';
    let ollamaBaseUrl = 'http://localhost:11434';
    let ollamaModel = 'nomic-embed-text';

    try {
      const docRef = doc(db, 'settings', 'ia_config');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.provider) provider = data.provider;
        if (data.ollamaBaseUrl) ollamaBaseUrl = data.ollamaBaseUrl;
        if (data.ollamaEmbeddingModel) ollamaModel = data.ollamaEmbeddingModel;
        else if (data.ollamaModel) ollamaModel = data.ollamaModel;
      } else {
        if (typeof window !== 'undefined') {
          provider = localStorage.getItem('ai_provider') || 'gemini';
          ollamaBaseUrl = localStorage.getItem('ollama_base_url') || 'http://localhost:11434';
          ollamaModel = localStorage.getItem('ollama_embedding_model') || 'nomic-embed-text';
        }
      }
    } catch (error) {
      console.warn("Erro ao buscar ia_config para embeddings, usando localstorage fallback:", error);
      if (typeof window !== 'undefined') {
        provider = localStorage.getItem('ai_provider') || 'gemini';
        ollamaBaseUrl = localStorage.getItem('ollama_base_url') || 'http://localhost:11434';
        ollamaModel = localStorage.getItem('ollama_embedding_model') || 'nomic-embed-text';
      }
    }

    if (provider === 'ollama') {
      const ollamaService = new OllamaEmbeddingService(ollamaModel, ollamaBaseUrl);
      return ollamaService.generateEmbedding(text);
    } else {
      const geminiService = new GeminiEmbeddingService();
      return geminiService.generateEmbedding(text);
    }
  }
}
