import { ChatSession, Message } from './Chat';

export interface IChatRepository {
  /**
   * Retrieves a chat session by its ID.
   */
  getSession(userId: string, sessionId: string): Promise<ChatSession | null>;

  /**
   * Saves a new message to a specific chat session.
   */
  saveMessage(userId: string, sessionId: string, message: Message): Promise<void>;

  /**
   * Updates the session metadata (e.g., last message, updatedAt).
   */
  updateSession(userId: string, session: ChatSession): Promise<void>;

  /**
   * Creates a new chat session.
   */
  createSession(userId: string, title: string, lastMessage: string): Promise<ChatSession>;

  /**
   * Deletes a chat session.
   */
  deleteSession(userId: string, sessionId: string): Promise<void>;

  /**
   * Listens to sessions in real-time.
   */
  listenToSessions(userId: string, callback: (sessions: ChatSession[]) => void, onError: (error: Error) => void): () => void;

  /**
   * Listens to messages in real-time for a session.
   */
  listenToMessages(userId: string, sessionId: string, callback: (messages: Message[]) => void, onError: (error: Error) => void): () => void;
}
