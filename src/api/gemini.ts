import { GoogleGenAI } from "@google/genai";
import { Message, Role } from "../types";

let ai: GoogleGenAI | null = null;

function getAI() {
  if (!ai) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set. Using mock mode.");
      return null;
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

const INSURANCE_KB = [
  {
    category: "Coverage",
    question: "What is covered in my basic policy?",
    answer: "Basic coverage includes protection against fire, theft, windstorms, and vandalism. It also provides liability protection for accidents on your property."
  },
  {
    category: "Claims",
    question: "How do I file a claim?",
    answer: "You can file a claim through our mobile app, website, or by calling our 24/7 support line at 0800-SEGURA. Have your policy number and incident details ready."
  },
  {
    category: "Payments",
    question: "What payment methods are accepted?",
    answer: "We accept credit cards, debit cards, bank transfers, and PIX. You can also set up automatic monthly payments via our portal."
  },
  {
    category: "Policy Changes",
    question: "Can I cancel my policy at any time?",
    answer: "Yes, you can cancel your policy at any time. A pro-rated refund will be issued for any unused portion of your premium, minus a small administrative fee if applicable."
  },
  {
    category: "Policy Changes",
    question: "How do I add a new vehicle to my policy?",
    answer: "To add a vehicle, go to 'My Policies' > 'Add Asset' and upload the vehicle registration documents. Our team will review and update your premium within 48 hours."
  }
];

export async function askSeguraBot(
  messages: Message[],
  onChunk?: (chunk: string) => void,
  provider: 'gemini' | 'ollama' | string = 'gemini'
) {
  try {
    const userMessage = messages[messages.length - 1].content;
    
    // Simple RAG: Find relevant context from our KB
    const relevantContext = INSURANCE_KB.filter(entry => 
      userMessage.toLowerCase().includes(entry.category.toLowerCase()) ||
      userMessage.toLowerCase().includes(entry.question.toLowerCase().split(' ')[0])
    ).map(entry => `Q: ${entry.question}\nA: ${entry.answer}`).join('\n\n');

    const systemInstruction = `
      You are SeguraBot, a specialized AI assistant for an insurance company called "Segura".
      Your goal is to provide accurate, helpful, and polite customer service.
      
      ### Guidelines:
      - Use the provided context from our internal Knowledge Base to answer questions whenever possible.
      - If you don't know the answer, politely direct the user to call our support line at 0800-SEGURA.
      - Be concise but thorough.
      - Speak in Portuguese (PT-BR) as the primary language, unless the user speaks in English.
      - Maintain a professional yet friendly "Premium Trust" tone.
      
      ### Knowledge Base Context:
      ${relevantContext || "No specific direct match found in KB. Use general insurance best practices but mention our support for specific cases."}
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

      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3', // You can change this to any model you have installed locally
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
      model: "gemini-1.5-flash",
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
