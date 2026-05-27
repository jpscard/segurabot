import { IChatRepository } from '../domain/IChatRepository';
import { IAIAssistantService } from '../domain/IAIAssistantService';
import { IKnowledgeBaseRepository } from '../domain/IKnowledgeBaseRepository';
import { ICustomerRepository } from '../domain/ICustomerRepository';
import { Message, Role } from '../domain/Chat';
import { createSeguraBotGraph } from './agents/SeguraBotGraph';

export class ProcessUserMessageUseCase {
  constructor(
    private chatRepository: IChatRepository,
    private aiService: IAIAssistantService,
    private knowledgeBaseRepository?: IKnowledgeBaseRepository,
    private customerRepository?: ICustomerRepository
  ) {}

  async execute(userId: string, sessionId: string, userText: string, onChunk?: (chunk: string) => void): Promise<Message> {
    // 1. Fetch current session (to get history, if needed)
    let session = await this.chatRepository.getSession(userId, sessionId);
    if (!session) {
      session = {
        id: sessionId,
        userId: userId,
        title: 'Nova Conversa',
        lastMessage: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        status: 'ia'
      };
      await this.chatRepository.updateSession(userId, session);
    } else if (session.status === 'concluido') {
      session.status = 'ia';
      await this.chatRepository.updateSession(userId, { id: sessionId, status: 'ia' });
    }

    // 2. Create and save user message
    const userMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      role: Role.USER,
      content: userText,
      timestamp: new Date().toISOString()
    };
    await this.chatRepository.saveMessage(userId, sessionId, userMessage);

    // 3. Update session metadata locally
    const history = session.messages || [];
    if (!history.some(m => m.id === userMessage.id)) {
      history.push(userMessage);
    }

    // 3.1. Guardrail Contra Prompt Injection
    const injectionPatterns = [
      "ignorar as instruções", "ignore as instruções", "ignore as instrucoes", "ignorar as instrucoes",
      "ignore previous instructions", "forget previous instructions",
      "desconsidere as instruções", "desconsidere as instrucoes", "esqueca as instruções", "esqueca as instrucoes",
      "you are now an admin", "você agora é um administrador", "voce agora e um administrador",
      "instruções de sistema", "instrucoes de sistema", "system instructions", "system prompt"
    ];
    
    const lowercaseInput = userText.toLowerCase();
    const hasInjection = injectionPatterns.some(pattern => lowercaseInput.includes(pattern));
    
    if (hasInjection) {
      const aiMessage: Message = {
        id: `msg-blocked-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        role: Role.MODEL,
        content: "⚠️ Ação bloqueada pelas políticas de segurança do SeguraBot (Tentativa de Prompt Injection detectada). Seus dados e apólices permanecem totalmente seguros e isolados.",
        timestamp: new Date().toISOString()
      };
      await this.chatRepository.saveMessage(userId, sessionId, aiMessage);
      
      session.lastMessage = aiMessage.content;
      session.updatedAt = new Date().toISOString();
      await this.chatRepository.updateSession(userId, session);
      
      onChunk?.(aiMessage.content);
      return aiMessage;
    }

    // Bypass se estiver no modo de atendimento humano
    if (session.status === 'humano') {
      session.lastMessage = userText;
      session.updatedAt = new Date().toISOString();
      await this.chatRepository.updateSession(userId, session);
      return userMessage;
    }

    // 4. Invocar o Grafo de Agentes (LangGraph)
    const graph = createSeguraBotGraph(this.chatRepository, this.aiService, this.knowledgeBaseRepository, this.customerRepository);
    
    const result = await graph.invoke({
      messages: history,
      userId: userId,
      sessionId: sessionId
    });
    
    const aiResponseText = result.finalResponse || "Desculpe, não consegui processar sua resposta.";

    // 6. Create and save AI message
    const aiMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      role: Role.MODEL,
      content: aiResponseText,
      timestamp: new Date().toISOString()
    };
    await this.chatRepository.saveMessage(userId, sessionId, aiMessage);

    // 7. Update session metadata in repository
    session.lastMessage = aiResponseText;
    session.updatedAt = new Date().toISOString();
    await this.chatRepository.updateSession(userId, session);

    return aiMessage;
  }
}
