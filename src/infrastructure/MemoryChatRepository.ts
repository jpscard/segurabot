import { IChatRepository } from '../domain/IChatRepository';
import { ChatSession, Message } from '../domain/Chat';

export class MemoryChatRepository implements IChatRepository {
  private sessions: Map<string, ChatSession> = new Map();

  async getSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async saveMessage(userId: string, sessionId: string, message: Message): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (!session.messages) session.messages = [];
      session.messages.push(message);
    }
  }

  async updateSession(userId: string, session: ChatSession | (Partial<ChatSession> & { id: string })): Promise<void> {
    const existing = this.sessions.get(session.id) || {} as ChatSession;
    const merged = { ...existing, ...session } as ChatSession;
    this.sessions.set(session.id, merged);
  }
  
  async createSession(userId: string, title: string, lastMessage: string): Promise<ChatSession> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const session: ChatSession = {
      id: sessionId,
      userId: userId,
      title: title || 'Conversa Local',
      lastMessage: lastMessage || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      status: 'ia',
      operatorName: ''
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  listenToSessions(userId: string, callback: (sessions: ChatSession[]) => void, onError: (error: Error) => void): () => void {
    const userSessions = Array.from(this.sessions.values()).filter(s => s.userId === userId);
    callback(userSessions);
    return () => {};
  }

  listenToAllSessions(callback: (sessions: ChatSession[]) => void, onError: (error: Error) => void): () => void {
    callback(Array.from(this.sessions.values()));
    return () => {};
  }

  listenToMessages(userId: string, sessionId: string, callback: (messages: Message[]) => void, onError: (error: Error) => void): () => void {
    const session = this.sessions.get(sessionId);
    callback(session?.messages || []);
    return () => {};
  }
}
