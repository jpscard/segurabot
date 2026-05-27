import { IAIAssistantService } from '../domain/IAIAssistantService';
import { Message, Role } from '../domain/Chat';

export class OllamaAssistantService implements IAIAssistantService {
  private baseUrl: string;
  private modelName: string;

  constructor(modelName: string = 'llama3', baseUrl: string = 'http://localhost:11434') {
    this.modelName = modelName;
    this.baseUrl = baseUrl;
  }

  async generateResponse(history: Message[], newPrompt: string, onChunk?: (chunk: string) => void): Promise<string> {
    try {
      // Map our history to Ollama's chat format
      const ollamaMessages = history.map(msg => ({
        role: msg.role === Role.MODEL ? 'assistant' : 'user',
        content: msg.content
      }));

      // Add the new prompt
      ollamaMessages.push({
        role: 'user',
        content: newPrompt
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (this.baseUrl && this.baseUrl.includes('.loca.lt')) {
        headers['bypass-tunnel-reminder'] = 'true';
      }

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.modelName,
          messages: ollamaMessages,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP error! status: ${response.status}`);
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

    } catch (error) {
      console.error("Ollama Error:", error);
      throw new Error(`Falha ao se comunicar com o modelo local Ollama (${this.modelName}). Certifique-se de que o Ollama está rodando.`);
    }
  }
}
