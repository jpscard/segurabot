import { collection, getDocs, query } from 'firebase/firestore';
import { db } from './firebase';
import { KnowledgeBaseEntry } from '../domain';
import { IKnowledgeBaseRepository } from '../domain/IKnowledgeBaseRepository';
import { GeminiEmbeddingService } from './GeminiEmbeddingService';

export class FirebaseKnowledgeBaseRepository implements IKnowledgeBaseRepository {
  private embeddingService = new GeminiEmbeddingService();

  async searchRelevantContext(userQuery: string): Promise<KnowledgeBaseEntry[]> {
    try {
      // 1. Gerar embedding para a query do usuário
      let queryEmbedding: number[] | null = null;
      try {
        queryEmbedding = await this.embeddingService.generateEmbedding(userQuery);
      } catch (e) {
        console.warn("Erro ao gerar embedding para busca, usando fallback de palavra-chave:", e);
      }

      // 2. Buscar entradas da base de conhecimento
      const kbRef = collection(db, 'knowledge_base');
      const q = query(kbRef);
      const snapshot = await getDocs(q);

      const allEntries = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as any)
      );

      if (allEntries.length === 0) return [];

      // 3. Rankear por similaridade de cosseno ou fallback por palavra-chave
      const scoredEntries = allEntries.map(entry => {
        let score = 0;

        if (queryEmbedding && entry.embedding) {
          score = this.cosineSimilarity(queryEmbedding, entry.embedding);
        } else {
          // Fallback para busca por palavra-chave
          const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const textToSearch = `${entry.category} ${entry.question} ${entry.answer}`.toLowerCase();
          
          queryWords.forEach(word => {
            if (textToSearch.includes(word)) score += 0.1; // Score menor para busca por palavra-chave
          });
        }

        return { entry, score };
      });

      // Ordenar por score descendente e pegar os top 3
      const relevantEntries = scoredEntries
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(item => item.entry as KnowledgeBaseEntry);

      return relevantEntries;

    } catch (error) {
      console.error('Error fetching knowledge base:', error);
      return [];
    }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let mA = 0;
    let mB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      mA += vecA[i] * vecA[i];
      mB += vecB[i] * vecB[i];
    }
    mA = Math.sqrt(mA);
    mB = Math.sqrt(mB);
    if (mA === 0 || mB === 0) return 0;
    return dotProduct / (mA * mB);
  }
}
