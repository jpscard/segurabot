import { KnowledgeBaseEntry } from './index';

export interface IKnowledgeBaseRepository {
  /**
   * Searches the knowledge base for entries relevant to the user query.
   * In a simple implementation, it could filter by keywords. 
   * In an advanced implementation, it uses Vector Search (Embeddings).
   * 
   * @param query The user's message/query.
   * @returns An array of relevant knowledge base entries.
   */
  searchRelevantContext(query: string): Promise<KnowledgeBaseEntry[]>;
}
