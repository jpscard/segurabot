import { IChatRepository } from '../domain/IChatRepository';
import { ChatSession, Message } from '../domain/Chat';
import { db } from './firebase';
import { doc, getDoc, collection, addDoc, setDoc, getDocs, orderBy, query, deleteDoc, onSnapshot } from 'firebase/firestore';

export class FirebaseChatRepository implements IChatRepository {
  async getSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    try {
      const sessionRef = doc(db, `users/${userId}/chat_sessions/${sessionId}`);
      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) {
        return null;
      }

      const sessionData = sessionSnap.data();
      
      // Fetch messages for this session
      const messagesRef = collection(db, `users/${userId}/chat_sessions/${sessionId}/messages`);
      const messagesQuery = query(messagesRef, orderBy('timestamp', 'asc'));
      const messagesSnap = await getDocs(messagesQuery);
      
      const messages: Message[] = [];
      messagesSnap.forEach(doc => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          role: data.role,
          content: data.content,
          timestamp: data.timestamp,
          senderName: data.senderName
        });
      });

      return {
        id: sessionSnap.id,
        userId: userId,
        title: sessionData.title || 'Novo Atendimento',
        lastMessage: sessionData.lastMessage || '',
        updatedAt: sessionData.updatedAt || '',
        createdAt: sessionData.createdAt || '',
        status: sessionData.status || 'ia',
        operatorName: sessionData.operatorName || '',
        messages: messages
      };
    } catch (error) {
      console.error("Error getting session:", error);
      throw error;
    }
  }

  async saveMessage(userId: string, sessionId: string, message: Message): Promise<void> {
    try {
      const messagesRef = collection(db, `users/${userId}/chat_sessions/${sessionId}/messages`);
      await addDoc(messagesRef, {
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        senderName: message.senderName || null
      });
    } catch (error) {
      console.error("Error saving message:", error);
      throw error;
    }
  }

  async updateSession(userId: string, session: ChatSession): Promise<void> {
    try {
      const sessionRef = doc(db, `users/${userId}/chat_sessions/${session.id}`);
      await setDoc(sessionRef, {
        lastMessage: session.lastMessage,
        updatedAt: session.updatedAt,
        status: session.status || 'ia',
        operatorName: session.operatorName || null
      }, { merge: true });
    } catch (error) {
      console.error("Error updating session:", error);
      throw error;
    }
  }

  async createSession(userId: string, title: string, lastMessage: string): Promise<ChatSession> {
    try {
      const path = `users/${userId}/chat_sessions`;
      const createdAt = new Date().toISOString();
      const docRef = await addDoc(collection(db, path), {
        userId,
        title,
        lastMessage,
        createdAt,
        updatedAt: createdAt,
        status: 'ia',
        operatorName: ''
      });
      return {
        id: docRef.id,
        userId,
        title,
        lastMessage,
        createdAt,
        updatedAt: createdAt,
        status: 'ia',
        operatorName: ''
      };
    } catch (error) {
      console.error("Error creating session:", error);
      throw error;
    }
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    try {
      const sessionRef = doc(db, `users/${userId}/chat_sessions/${sessionId}`);
      await deleteDoc(sessionRef);
    } catch (error) {
      console.error("Error deleting session:", error);
      throw error;
    }
  }

  listenToSessions(userId: string, callback: (sessions: ChatSession[]) => void, onError: (error: Error) => void): () => void {
    const q = query(collection(db, `users/${userId}/chat_sessions`), orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession));
      callback(docs);
    }, (error) => {
      onError(error);
    });
  }

  listenToMessages(userId: string, sessionId: string, callback: (messages: Message[]) => void, onError: (error: Error) => void): () => void {
    const q = query(collection(db, `users/${userId}/chat_sessions/${sessionId}/messages`), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      callback(msgs);
    }, (error) => {
      onError(error);
    });
  }
}
