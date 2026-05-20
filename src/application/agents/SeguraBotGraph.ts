import { StateGraph, Annotation } from "@langchain/langgraph";
import { IChatRepository } from "../../domain/IChatRepository";
import { IKnowledgeBaseRepository } from "../../domain/IKnowledgeBaseRepository";
import { ICustomerRepository } from "../../domain/ICustomerRepository";
import { IAIAssistantService } from "../../domain/IAIAssistantService";
import { Message, Role } from "../../domain/Chat";

// 1. Definimos o Estado do Grafo
export const SeguraBotState = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  userId: Annotation<string>(),
  sessionId: Annotation<string>(),
  nextAgent: Annotation<string>(),
  finalResponse: Annotation<string>(),
});

// 2. Factory function para criar o Grafo com as dependências
export function createSeguraBotGraph(
  chatRepo: IChatRepository,
  aiService: IAIAssistantService,
  kbRepo?: IKnowledgeBaseRepository,
  customerRepo?: ICustomerRepository
) {
  
  // Nó do Supervisor (Roteador Inteligente usando Gemini)
  const supervisorNode = async (state: typeof SeguraBotState.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const userText = lastMessage.content.toLowerCase();
    
    // Bypass direto por palavra-chave para acelerar a resposta e evitar latência de LLM
    if (
      userText.includes("falar com humano") ||
      userText.includes("falar com atendente") ||
      userText.includes("atendente humano") ||
      userText.includes("suporte humano") ||
      userText.includes("falar com pessoa") ||
      userText.includes("corretor") ||
      userText.includes("transferir para humano")
    ) {
      return { nextAgent: "handoff_agent" };
    }
    
    const prompt = `Você é o Supervisor do SeguraBot. Sua função é analisar a mensagem do usuário e decidir qual agente especialista deve responder.
    
Responda APENAS com o identificador do agente, sem nenhuma outra palavra ou pontuação.

Os agentes disponíveis são:
- 'knowledge_agent': Escolha este se o usuário estiver perguntando sobre regras, coberturas, manuais, ou como funciona algum seguro.
- 'support_agent': Escolha este se o usuário estiver perguntando sobre os dados dele, perfil, tickets de suporte, status da apólice dele ou assuntos pessoais.
- 'handoff_agent': Escolha este se o usuário estiver solicitando falar com um atendente humano, corretor, suporte real, ou demonstrando insatisfação e querendo suporte direto de uma pessoa.
- 'general_agent': Escolha este para qualquer outro assunto, saudações, conversas gerais ou se não tiver certeza.

Mensagem do Usuário: "${lastMessage.content}"

Resposta:`;

    try {
      const response = await aiService.generateResponse(state.messages, prompt);
      const cleanedResponse = response.trim().toLowerCase();

      if (cleanedResponse.includes("knowledge_agent")) return { nextAgent: "knowledge_agent" };
      if (cleanedResponse.includes("support_agent")) return { nextAgent: "support_agent" };
      if (cleanedResponse.includes("handoff_agent")) return { nextAgent: "handoff_agent" };
    } catch (error) {
      console.error("Erro no Supervisor inteligente, usando fallback por palavra-chave:", error);
      // Fallback por palavra-chave se a IA falhar
      const text = lastMessage.content.toLowerCase();
      if (text.includes("cobertura") || text.includes("manual")) return { nextAgent: "knowledge_agent" };
      if (text.includes("meu") || text.includes("cadastro")) return { nextAgent: "support_agent" };
      if (text.includes("humano") || text.includes("atendente") || text.includes("pessoa") || text.includes("corretor")) return { nextAgent: "handoff_agent" };
    }
    
    return { nextAgent: "general_agent" };
  };

  // Nó do Especialista em RAG (Usa Gemini)
  const knowledgeNode = async (state: typeof SeguraBotState.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    
    let context = "Nenhuma informação encontrada na base de conhecimento.";
    if (kbRepo) {
      const docs = await kbRepo.searchRelevantContext(lastMessage.content);
      if (docs.length > 0) {
        context = docs.map(doc => `[FAQ]: Q: ${doc.question} R: ${doc.answer}`).join("\n\n");
      }
    }

    const prompt = `Você é o Agente Especialista em Seguros. Responda a pergunta do usuário baseando-se APENAS no contexto abaixo. NÃO use emojis nas suas respostas.
    
Contexto:
${context}
 
Pergunta: ${lastMessage.content}`;

    const response = await aiService.generateResponse(state.messages, prompt);
    return { finalResponse: response };
  };

  // Nó do Suporte (CRM) (Usa Gemini)
  const supportNode = async (state: typeof SeguraBotState.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    
    let context = "Não foi possível carregar os dados do seu perfil.";
    if (customerRepo && state.userId) {
      const profile = await customerRepo.getCustomerProfile(state.userId);
      if (profile) {
        context = `Nome: ${profile.name}\nApólices: ${profile.activePolicies.join(", ")}`;
      }
    }

    const prompt = `Você é o Agente de Suporte. Responda a pergunta do usuário sabendo que estes são os dados dele. NÃO use emojis nas suas respostas.
    
${context}

Pergunta: ${lastMessage.content}`;

    const response = await aiService.generateResponse(state.messages, prompt);
    return { finalResponse: response };
  };

  // Nó de Atendimento Geral (Usa OLLAMA LOCAL - Gemma 4)
  const generalNode = async (state: typeof SeguraBotState.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    
    try {
      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemma4:latest",
          prompt: `Você é o SeguraBot, um assistente geral de seguros. Responda amigavelmente à seguinte mensagem, sem usar nenhum emoji: ${lastMessage.content}`,
          stream: false
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return { finalResponse: data.response };
      }
    } catch (error) {
      console.error("Erro ao chamar Ollama, usando fallback para Gemini:", error);
    }
    
    // Fallback para o Gemini se o Ollama falhar
    const prompt = `Você é o SeguraBot, um assistente geral de seguros. Responda amigavelmente e sem usar emojis.
    
Pergunta: ${lastMessage.content}`;

    const response = await aiService.generateResponse(state.messages, prompt);
    return { finalResponse: response };
  };

  // Nó de Handoff (Transbordo Humano)
  const handoffNode = async (state: typeof SeguraBotState.State) => {
    try {
      const session = await chatRepo.getSession(state.userId, state.sessionId);
      if (session) {
        session.status = 'aguardando_humano';
        await chatRepo.updateSession(state.userId, session);
      }
    } catch (err) {
      console.error("Erro ao atualizar status da sessão para transbordo humano:", err);
    }

    const response = "Entendi perfeitamente. Estou transferindo o seu atendimento para um especialista humano neste momento. Por favor, aguarde alguns instantes enquanto um de nossos corretores assume a conversa. Você verá um aviso no topo da tela assim que o atendimento for iniciado.";
    return { finalResponse: response };
  };

  // 3. Construção do Grafo
  const workflow = new StateGraph(SeguraBotState)
    .addNode("supervisor", supervisorNode)
    .addNode("knowledge_agent", knowledgeNode)
    .addNode("support_agent", supportNode)
    .addNode("general_agent", generalNode)
    .addNode("handoff_agent", handoffNode)
    
    .setEntryPoint("supervisor")
    
    .addConditionalEdges(
      "supervisor",
      (state) => state.nextAgent,
      {
        knowledge_agent: "knowledge_agent",
        support_agent: "support_agent",
        general_agent: "general_agent",
        handoff_agent: "handoff_agent",
      }
    )
    
    .addEdge("knowledge_agent", "__end__")
    .addEdge("support_agent", "__end__")
    .addEdge("general_agent", "__end__")
    .addEdge("handoff_agent", "__end__");
  return workflow.compile();
}
