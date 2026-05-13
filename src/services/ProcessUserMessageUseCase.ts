import { IChatRepository } from '../types/IChatRepository';
import { IAIAssistantService } from '../types/IAIAssistantService';
import { IKnowledgeBaseRepository } from '../types/IKnowledgeBaseRepository';
import { ICustomerRepository } from '../types/ICustomerRepository';
import { Message, Role } from '../types/Chat';

export class ProcessUserMessageUseCase {
  constructor(
    private chatRepository: IChatRepository,
    private aiService: IAIAssistantService,
    private knowledgeBaseRepository?: IKnowledgeBaseRepository,
    private customerRepository?: ICustomerRepository
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

    // 4. RAG & CRM: Fetch relevant knowledge base entries and CRM profile
    let enrichedPrompt = userText;
    let systemInstructions = "";
    
    if (this.customerRepository) {
      const profile = await this.customerRepository.getCustomerProfile(session.userId);
      if (profile) {
        const tickets = await this.customerRepository.getSupportTickets(session.userId);
        systemInstructions += `\n[INFORMAÇÕES DO CLIENTE (CRM)]\nNome: ${profile.name}\nEmail: ${profile.email}\nCategoria: ${profile.loyaltyTier || 'Padrão'}\nApólices Ativas: ${profile.activePolicies.join(', ') || 'Nenhuma'}\n`;
        
        if (tickets.length > 0) {
          systemInstructions += `\n[HISTÓRICO DE TICKETS DE SUPORTE]\n`;
          tickets.forEach(t => {
            systemInstructions += `- Assunto: ${t.subject} | Status: ${t.status} | Resolução: ${t.resolution || 'N/A'}\n`;
          });
        }
      }
    }
    
    if (this.knowledgeBaseRepository) {
      const relevantDocs = await this.knowledgeBaseRepository.searchRelevantContext(userText);
      
      if (relevantDocs.length > 0) {
        const docsContext = relevantDocs.map(doc => `[FAQ: ${doc.category}]\nQ: ${doc.question}\nR: ${doc.answer}\nSource: ${doc.source}`).join('\n\n');
        systemInstructions += `\n[BASE DE CONHECIMENTO (RAG)]\nAs seguintes regras oficiais da seguradora foram encontradas para responder a pergunta:\n${docsContext}\n`;
      }
    }
    
    if (systemInstructions) {
      enrichedPrompt = `INSTRUÇÃO DE SISTEMA:
Você é o SeguraBot, assistente oficial da seguradora.
Utilize APENAS o contexto abaixo (Regras da Base de Conhecimento e Dados do Cliente) para responder. Se a resposta não estiver no contexto, diga que não sabe. NÃO alucine coberturas.
${systemInstructions}

---
Pergunta do Usuário: ${userText}`;
    }

    // 5. Get response from AI
    const aiResponseText = await this.aiService.generateResponse(history, enrichedPrompt);

    // 6. Create and save AI message
    const aiMessage: Message = {
      role: Role.MODEL,
      content: aiResponseText,
      timestamp: new Date().toISOString()
    };
    await this.chatRepository.saveMessage(sessionId, aiMessage);

    // 7. Update session metadata in repository
    session.lastMessage = aiResponseText;
    session.updatedAt = new Date().toISOString();
    await this.chatRepository.updateSession(session);

    return aiMessage;
  }
}
