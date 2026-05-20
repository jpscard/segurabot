import { GoogleGenAI } from "@google/genai";
import { Message, Role } from "../domain";

let ai: GoogleGenAI | null = null;
let lastApiKey: string | null = null;

function getAI() {
  const customKey = typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;
  const apiKey = customKey || import.meta.env.VITE_GEMINI_API_KEY || "";
  
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Using mock mode.");
    return null;
  }

  if (!ai || lastApiKey !== apiKey) {
    ai = new GoogleGenAI({ apiKey });
    lastApiKey = apiKey;
  }
  return ai;
}

import { FirebaseKnowledgeBaseRepository } from './FirebaseKnowledgeBaseRepository';
import { FirebaseCustomerRepository } from './FirebaseCustomerRepository';

const kbRepository = new FirebaseKnowledgeBaseRepository();
const customerRepo = new FirebaseCustomerRepository();

export async function askSeguraBot(
  messages: Message[],
  onChunk?: (chunk: string) => void,
  provider: 'gemini' | 'ollama' | string = 'gemini',
  userId?: string
) {
  try {
    const userMessage = messages[messages.length - 1].content;
    
    // Dynamic RAG: Find relevant context from Firebase Knowledge Base
    const relevantDocs = await kbRepository.searchRelevantContext(userMessage);
    const relevantContext = relevantDocs.length > 0 
      ? relevantDocs.map(entry => `Q: ${entry.question}\nA: ${entry.answer}\nSource: ${entry.source || 'Base de Conhecimento'}`).join('\n\n')
      : "";

    let crmContext = "";
    if (userId) {
      const profile = await customerRepo.getCustomerProfile(userId);
      if (profile) {
        const tickets = await customerRepo.getSupportTickets(userId);
        crmContext = `\n### Informações do Cliente (CRM):\nNome: ${profile.name}\nEmail: ${profile.email}\nCategoria: ${profile.loyaltyTier || 'Padrão'}\nApólices Ativas: ${profile.activePolicies.join(', ') || 'Nenhuma'}\n`;
        
        if (tickets.length > 0) {
          crmContext += `\n### Histórico de Tickets de Suporte:\n`;
          tickets.forEach(t => {
            crmContext += `- Assunto: ${t.subject} | Status: ${t.status} | Resolução: ${t.resolution || 'N/A'}\n`;
          });
        }
      }
    }

    const systemInstruction = `
      You are SeguraBot, a specialized AI assistant for an insurance company called "Segura".
      Your goal is to provide accurate, helpful, and polite customer service.
      
      ### Guidelines:
      - Use the provided context from our internal Knowledge Base to answer questions whenever possible.
      - If you don't know the answer, politely direct the user to call our support line at 0800-SEGURA.
      - Use the Customer CRM Data to personalize the interaction and provide specific details about their policies or tickets if they ask.
      - Be concise but thorough.
      - Speak in Portuguese (PT-BR) as the primary language, unless the user speaks in English.
      - Maintain a professional yet friendly "Premium Trust" tone.
      
      ### Knowledge Base Context:
      ${relevantContext || "No specific direct match found in KB. Use general insurance best practices but mention our support for specific cases."}
      ${crmContext}
    `;

    if (provider === 'ollama') {
      // Local Ollama integration
      const ollamaMessages = [
        { role: 'system', content: systemInstruction },
        ...messages.map(msg => ({
          role: msg.role === Role.USER ? 'user' : 'assistant',
          content: msg.content
        }))
      ];

      const selectedModel = (typeof window !== 'undefined' && typeof localStorage !== 'undefined')
        ? localStorage.getItem('ollama_model') || 'llama3'
        : 'llama3';

      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: ollamaMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}. Please ensure Ollama is running locally.`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.message && data.message.content) {
                fullText += data.message.content;
                onChunk?.(data.message.content);
              }
            } catch (e) {
              console.error("Error parsing Ollama chunk", e);
            }
          }
        }
      }
      return fullText;
    }

    // Default to Gemini
    const aiInstance = getAI();
    if (!aiInstance) {
      // Mock streaming
      const mockResponse = `**Modo de Demonstração (Gemini)**
      
A chave da API Gemini (\`VITE_GEMINI_API_KEY\`) não foi configurada.

Aqui está uma resposta baseada no nosso conhecimento interno:

${relevantContext || "Não encontrei uma resposta específica no conhecimento interno, mas posso ajudar a tirar dúvidas sobre coberturas, sinistros ou pagamentos se você configurar a chave da API."}

Por favor, adicione a variável \`VITE_GEMINI_API_KEY\` no seu arquivo \`.env.local\` para habilitar a IA completa.`;

      const chunks = mockResponse.split(' ');
      for (const chunk of chunks) {
        onChunk?.(chunk + ' ');
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      return mockResponse;
    }

    const responseStream = await aiInstance.models.generateContentStream({
      model: "gemini-3-flash",
      contents: { parts: [{ text: messages[messages.length - 1].content }] },
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    let fullText = "";
    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        onChunk?.(text);
      }
    }

    return fullText;
  } catch (error) {
    console.error("AI API Error:", error);
    throw error;
  }
}

export async function extractFAQsFromPDF(base64Data: string): Promise<any[]> {
  const aiInstance = getAI();
  if (!aiInstance) throw new Error("A chave da API Gemini não está configurada.");

  const prompt = `Aja como um analista de seguros sênior. Leia este manual/documento em anexo. 
Extraia todas as regras, coberturas, procedimentos e diretrizes importantes.
Crie um conjunto de Perguntas e Respostas cobrindo todo o documento.

Retorne EXATAMENTE E APENAS UM ARRAY JSON válido contendo objetos no seguinte formato:
[
  {
    "category": "Nome da Categoria (Ex: Sinistros, Coberturas)",
    "question": "Pergunta extraída do documento?",
    "answer": "Resposta detalhada com base no texto.",
    "source": "Nome do Documento ou Secção"
  }
]
ATENÇÃO: Não inclua blocos markdown (como \`\`\`json). Retorne apenas o array JSON puro, começando com [ e terminando com ].`;

  // Remove the prefix "data:application/pdf;base64," if it exists
  const b64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;

  const response = await aiInstance.models.generateContent({
    model: "gemini-3-flash",
    contents: {
      role: "user",
      parts: [
        { inlineData: { mimeType: "application/pdf", data: b64 } },
        { text: prompt }
      ]
    }
  });

  const text = response.text || "[]";
  const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
  try {
    return JSON.parse(cleanedText);
  } catch (e) {
    console.error("Erro ao fazer parse do JSON do Gemini:", cleanedText);
    throw new Error("A IA não retornou um formato JSON válido. Tente enviar um PDF menor.");
  }
}

export async function generateCustomerSummaryWithAI(profileData: any, tickets: any[]): Promise<string> {
  const aiInstance = getAI();
  
  const policiesDesc = profileData.policies && profileData.policies.length > 0 
    ? profileData.policies.map((p: any) => `- Ramo: ${p.type} | Bem: ${p.assetDescription} | Limite: ${p.coverageLimits} | Prêmio: R$ ${p.premiumValue}`).join('\n')
    : 'Nenhuma apólice cadastrada.';
    
  const claimsDesc = profileData.claims && profileData.claims.length > 0
    ? profileData.claims.map((c: any) => `- Descrição: ${c.description} | Status: ${c.status} | Data: ${c.openedAt}`).join('\n')
    : 'Nenhum sinistro em andamento.';

  const ticketsDesc = tickets && tickets.length > 0
    ? tickets.map((t: any) => `- Assunto: ${t.subject} | Status: ${t.status} | Resolução: ${t.resolution || 'N/A'}`).join('\n')
    : 'Nenhum chamado de suporte aberto.';

  if (!aiInstance) {
    // Fallback dinâmico detalhado e real
    return `Cliente: ${profileData.name || 'Cliente'}
Fidelidade: ${profileData.loyaltyTier || 'Padrão'}
Fase da Vida: ${profileData.lifeStage || 'Não Informada'}
Score de Risco: ${profileData.riskScore || 0}%

Apólices Cadastradas:
${policiesDesc}

Sinistros:
${claimsDesc}

Chamados de Suporte:
${ticketsDesc}

(Nota: Este resumo foi consolidado localmente em modo offline/sem chave API).`;
  }

  const prompt = `Consolide um resumo analítico sucinto (máximo 4 linhas) do seguinte cliente da Seguradora Segura para guiar o atendimento por IA.
Nome: ${profileData.name}
Telefone: ${profileData.phone || 'Não cadastrado'}
Fidelidade: ${profileData.loyaltyTier || 'Padrão'}
Fase da Vida: ${profileData.lifeStage || 'Não informada'}
Score de Risco Sinistral: ${profileData.riskScore || 0}%

Apólices Ativas:
${policiesDesc}

Histórico de Sinistros:
${claimsDesc}

Chamados de Suporte:
${ticketsDesc}

Escreva em português (PT-BR) de forma profissional, direta e executiva, destacando oportunidades de venda (cross-selling) ou pontos críticos que o atendente de IA deve ter cuidado (ex: sinistro em análise, score alto risco).`;

  try {
    const response = await aiInstance.models.generateContent({
      model: "gemini-3-flash",
      contents: prompt
    });
    return response.text?.trim() || "Sem resposta da IA.";
  } catch (error) {
    console.error("Erro na geração do resumo do cliente:", error);
    throw error;
  }
}

export async function extractDocumentOcrWithAI(base64Data: string, fileType: string): Promise<string> {
  const aiInstance = getAI();
  if (!aiInstance) {
    throw new Error("A chave da API Gemini não está configurada para processar OCR por IA.");
  }

  const prompt = `Você é um leitor de OCR de seguros especializado. Analise a imagem ou documento anexo do tipo "${fileType}".
Extraia todos os dados textuais cruciais em português de forma clara e organizada, por exemplo:
- Para CNH/RG: Nome completo, CPF/RG, data de nascimento, validade, categoria de habilitação (se aplicável).
- Para CRLV: Placa, chassi, modelo do veículo, ano de fabricação/modelo, proprietário.
- Para outros: Dados do titular, datas chaves, valores envolvidos ou endereços.

Retorne apenas o texto limpo com os dados extraídos de forma estruturada. Seja preciso e não invente dados adicionais.`;

  // Remove o prefixo base64 se houver
  const b64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
  // Determina o tipo MIME
  let mimeType = "application/pdf";
  if (base64Data.includes("data:")) {
    const matched = base64Data.match(/data:([^;]+);base64,/);
    if (matched) mimeType = matched[1];
  }

  try {
    const response = await aiInstance.models.generateContent({
      model: "gemini-3-flash",
      contents: {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: b64 } },
          { text: prompt }
        ]
      }
    });
    return response.text?.trim() || "Não foi possível extrair dados legíveis do documento.";
  } catch (error) {
    console.error("Erro no processamento OCR por IA:", error);
    throw error;
  }
}

