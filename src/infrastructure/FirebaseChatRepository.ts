import { IChatRepository } from '../domain/IChatRepository';
import { ChatSession, Message } from '../domain/Chat';
import { db } from './firebase';
import { doc, getDoc, collection, addDoc, setDoc, getDocs, orderBy, query, deleteDoc, onSnapshot, collectionGroup } from 'firebase/firestore';

export class FirebaseChatRepository implements IChatRepository {
  async getSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    if (!userId || !sessionId) {
      console.warn("FirebaseChatRepository.getSession: Empty userId or sessionId", { userId, sessionId });
      return null;
    }
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
        clientTyping: sessionData.clientTyping ?? false,
        operatorTyping: sessionData.operatorTyping ?? false,
        messages: messages
      };
    } catch (error) {
      console.error("Error getting session:", error);
      throw error;
    }
  }

  async saveMessage(userId: string, sessionId: string, message: Message): Promise<void> {
    if (!userId || !sessionId) {
      console.warn("FirebaseChatRepository.saveMessage: Empty userId or sessionId", { userId, sessionId });
      return;
    }
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

  async updateSession(userId: string, session: ChatSession | (Partial<ChatSession> & { id: string })): Promise<void> {
    if (!userId || !session || !session.id) {
      console.warn("FirebaseChatRepository.updateSession: Empty userId or sessionId", { userId, session });
      return;
    }
    try {
      const sessionRef = doc(db, `users/${userId}/chat_sessions/${session.id}`);
      const dataToSave: any = {
        updatedAt: session.updatedAt || new Date().toISOString()
      };
      if (session.status !== undefined) dataToSave.status = session.status;
      if (userId) dataToSave.userId = userId;
      if (session.title) dataToSave.title = session.title;
      if (session.lastMessage !== undefined) dataToSave.lastMessage = session.lastMessage;
      if (session.createdAt) dataToSave.createdAt = session.createdAt;
      if (session.operatorName !== undefined) dataToSave.operatorName = session.operatorName || null;
      if (session.clientTyping !== undefined) dataToSave.clientTyping = session.clientTyping;
      if (session.operatorTyping !== undefined) dataToSave.operatorTyping = session.operatorTyping;

      await setDoc(sessionRef, dataToSave, { merge: true });
    } catch (error) {
      console.error("Error updating session:", error);
      throw error;
    }
  }

  async createSession(userId: string, title: string, lastMessage: string): Promise<ChatSession> {
    if (!userId) {
      console.error("FirebaseChatRepository.createSession: Empty userId");
      throw new Error("FirebaseChatRepository.createSession: userId is required");
    }
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
    if (!userId || !sessionId) {
      console.warn("FirebaseChatRepository.deleteSession: Empty userId or sessionId", { userId, sessionId });
      return;
    }
    try {
      const sessionRef = doc(db, `users/${userId}/chat_sessions/${sessionId}`);
      await deleteDoc(sessionRef);
    } catch (error) {
      console.error("Error deleting session:", error);
      throw error;
    }
  }

  listenToSessions(userId: string, callback: (sessions: ChatSession[]) => void, onError: (error: Error) => void): () => void {
    if (!userId) {
      console.warn("FirebaseChatRepository.listenToSessions: Empty userId");
      callback([]);
      return () => {};
    }
    const q = query(collection(db, `users/${userId}/chat_sessions`), orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || userId,
          title: data.title || 'Novo Atendimento',
          lastMessage: data.lastMessage || '',
          updatedAt: data.updatedAt || '',
          createdAt: data.createdAt || '',
          status: data.status || 'ia',
          operatorName: data.operatorName || '',
          clientTyping: data.clientTyping ?? false,
          operatorTyping: data.operatorTyping ?? false
        } as ChatSession;
      });
      callback(docs);
    }, (error) => {
      onError(error);
    });
  }

  listenToAllSessions(callback: (sessions: ChatSession[]) => void, onError: (error: Error) => void): () => void {
    const q = query(collectionGroup(db, 'chat_sessions'));
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || '',
          title: data.title || 'Novo Atendimento',
          lastMessage: data.lastMessage || '',
          updatedAt: data.updatedAt || '',
          createdAt: data.createdAt || '',
          status: data.status || 'ia',
          operatorName: data.operatorName || '',
          clientTyping: data.clientTyping ?? false,
          operatorTyping: data.operatorTyping ?? false
        } as ChatSession;
      });
      
      // Ordenação em memória robusta para contornar a obrigatoriedade de criação de índice composto Collection Group no console Firebase
      docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      
      callback(docs);
    }, (error) => {
      onError(error);
    });
  }

  listenToMessages(userId: string, sessionId: string, callback: (messages: Message[]) => void, onError: (error: Error) => void): () => void {
    if (!userId || !sessionId) {
      console.warn("FirebaseChatRepository.listenToMessages: Empty userId or sessionId", { userId, sessionId });
      callback([]);
      return () => {};
    }
    const q = query(collection(db, `users/${userId}/chat_sessions/${sessionId}/messages`), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      callback(msgs);
    }, (error) => {
      onError(error);
    });
  }
}
