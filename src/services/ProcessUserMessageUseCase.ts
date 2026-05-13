import { IChatRepository } from '../types/IChatRepository';
import { IAIAssistantService } from '../types/IAIAssistantService';
import { Message, Role } from '../types/Chat';

export class ProcessUserMessageUseCase {
  constructor(
    private chatRepository: IChatRepository,
    private aiService: IAIAssistantService
  ) {}

  async execute(sessionId: string, userText: string): Promise<Message> {
    // 1. Fetch current session (to get history, if needed)
    const session = await this.chatRepository.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    // 2. Create and save user message
    const userMessage: Message = {
      role: Role.USER,
      content: userText,
      timestamp: new Date().toISOString()
    };
    await this.chatRepository.saveMessage(sessionId, userMessage);

    // 3. Update session metadata locally
    const history = session.messages || [];
    history.push(userMessage);

    // 4. Get response from AI
    const aiResponseText = await this.aiService.generateResponse(history, userText);

    // 5. Create and save AI message
    const aiMessage: Message = {
      role: Role.MODEL,
      content: aiResponseText,
      timestamp: new Date().toISOString()
    };
    await this.chatRepository.saveMessage(sessionId, aiMessage);

    // 6. Update session metadata in repository
    session.lastMessage = aiResponseText;
    session.updatedAt = new Date().toISOString();
    await this.chatRepository.updateSession(session);

    return aiMessage;
  }
}
