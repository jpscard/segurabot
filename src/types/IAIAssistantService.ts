import { Message } from './Chat';

export interface IAIAssistantService {
  /**
   * Generates a response from the AI based on the conversation history.
   */
  generateResponse(history: Message[], newPrompt: string): Promise<string>;
}
