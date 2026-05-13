import { collection, getDocs, query } from 'firebase/firestore';
import { db } from './firebase';
import { KnowledgeBaseEntry } from '../types';
import { IKnowledgeBaseRepository } from '../types/IKnowledgeBaseRepository';

export class FirebaseKnowledgeBaseRepository implements IKnowledgeBaseRepository {
  async searchRelevantContext(userQuery: string): Promise<KnowledgeBaseEntry[]> {
    try {
      // 1. Fetch entries from the knowledge base
      // For MVP without Vector Extension, we pull the FAQs and do a simple keyword filter locally.
      // In production with RAG, you'd use Vertex AI Vector Search or similar Firebase extensions.
      const kbRef = collection(db, 'knowledge_base');
      const q = query(kbRef);
      const snapshot = await getDocs(q);

      const allEntries: KnowledgeBaseEntry[] = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as KnowledgeBaseEntry)
      );

      if (allEntries.length === 0) return [];

      // 2. Simple Keyword / Relevance filtering (Mocking a vector search)
      const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      
      const scoredEntries = allEntries.map(entry => {
        let score = 0;
        const textToSearch = `${entry.category} ${entry.question} ${entry.answer}`.toLowerCase();
        
        queryWords.forEach(word => {
          if (textToSearch.includes(word)) score += 1;
        });

        return { entry, score };
      });

      // Sort by score descending and take the top 3 relevant entries
      const relevantEntries = scoredEntries
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(item => item.entry);

      // If no exact keyword match, but we want to give some context, 
      // we could return generic FAQs, but returning empty means the LLM relies on general knowledge.
      return relevantEntries;

    } catch (error) {
      console.error('Error fetching knowledge base:', error);
      return [];
    }
  }
}
