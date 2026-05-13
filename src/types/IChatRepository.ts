import { ChatSession, Message } from './Chat';

export interface IChatRepository {
  /**
   * Retrieves a chat session by its ID.
   */
  getSession(sessionId: string): Promise<ChatSession | null>;

  /**
   * Saves a new message to a specific chat session.
   */
  saveMessage(sessionId: string, message: Message): Promise<void>;

  /**
   * Updates the session metadata (e.g., last message, updatedAt).
   */
  updateSession(session: ChatSession): Promise<void>;
}
