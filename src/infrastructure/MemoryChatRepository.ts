import { IChatRepository } from '../domain/IChatRepository';
import { ChatSession, Message } from '../domain/Chat';

export class MemoryChatRepository implements IChatRepository {
  private sessions: Map<string, ChatSession> = new Map();
  private sessionListeners: Map<string, Set<(sessions: ChatSession[]) => void>> = new Map();
  private allSessionListeners: Set<(sessions: ChatSession[]) => void> = new Set();
  private messageListeners: Map<string, Set<(messages: Message[]) => void>> = new Map();

  private notifySessionListeners(userId: string) {
    const userSessions = Array.from(this.sessions.values()).filter(s => s.userId === userId);
    const listeners = this.sessionListeners.get(userId);
    if (listeners) {
      listeners.forEach(cb => {
        try { cb(userSessions); } catch (e) { console.error("Error in session listener:", e); }
      });
    }
    
    const allSessions = Array.from(this.sessions.values());
    this.allSessionListeners.forEach(cb => {
      try { cb(allSessions); } catch (e) { console.error("Error in all session listener:", e); }
    });
  }

  private notifyMessageListeners(sessionId: string) {
    const session = this.sessions.get(sessionId);
    const messages = session?.messages || [];
    const listeners = this.messageListeners.get(sessionId);
    if (listeners) {
      listeners.forEach(cb => {
        try { cb(messages); } catch (e) { console.error("Error in message listener:", e); }
      });
    }
  }

  async getSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async saveMessage(userId: string, sessionId: string, message: Message): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (!session.messages) session.messages = [];
      const exists = session.messages.some(m => m.id === message.id);
      if (!exists) {
        session.messages = [...session.messages, { ...message }];
        this.notifyMessageListeners(sessionId);
        this.notifySessionListeners(session.userId);
      }
    }
  }

  async updateSession(userId: string, session: ChatSession | (Partial<ChatSession> & { id: string })): Promise<void> {
    const existing = this.sessions.get(session.id) || {} as ChatSession;
    const messagesCopy = 'messages' in session && session.messages 
      ? [...session.messages] 
      : (existing.messages ? [...existing.messages] : []);
      
    const merged = { 
      ...existing, 
      ...session,
      messages: messagesCopy
    } as ChatSession;
    
    this.sessions.set(session.id, merged);
    this.notifyMessageListeners(session.id);
    this.notifySessionListeners(merged.userId);
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
    this.notifySessionListeners(userId);
    return session;
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (session) {
      this.notifySessionListeners(session.userId);
    }
  }

  listenToSessions(userId: string, callback: (sessions: ChatSession[]) => void, onError: (error: Error) => void): () => void {
    if (!this.sessionListeners.has(userId)) {
      this.sessionListeners.set(userId, new Set());
    }
    this.sessionListeners.get(userId)!.add(callback);
    
    // Initial push
    const userSessions = Array.from(this.sessions.values()).filter(s => s.userId === userId);
    callback(userSessions);
    
    return () => {
      const listeners = this.sessionListeners.get(userId);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  listenToAllSessions(callback: (sessions: ChatSession[]) => void, onError: (error: Error) => void): () => void {
    this.allSessionListeners.add(callback);
    
    // Initial push
    callback(Array.from(this.sessions.values()));
    
    return () => {
      this.allSessionListeners.delete(callback);
    };
  }

  listenToMessages(userId: string, sessionId: string, callback: (messages: Message[]) => void, onError: (error: Error) => void): () => void {
    if (!this.messageListeners.has(sessionId)) {
      this.messageListeners.set(sessionId, new Set());
    }
    this.messageListeners.get(sessionId)!.add(callback);
    
    // Initial push
    const session = this.sessions.get(sessionId);
    callback(session?.messages || []);
    
    return () => {
      const listeners = this.messageListeners.get(sessionId);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }
}
