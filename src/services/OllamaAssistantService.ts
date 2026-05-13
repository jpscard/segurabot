import { IAIAssistantService } from '../types/IAIAssistantService';
import { Message, Role } from '../types/Chat';

export class OllamaAssistantService implements IAIAssistantService {
  private baseUrl: string;
  private modelName: string;

  constructor(modelName: string = 'llama3', baseUrl: string = 'http://localhost:11434') {
    this.modelName = modelName;
    this.baseUrl = baseUrl;
  }

  async generateResponse(history: Message[], newPrompt: string): Promise<string> {
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

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: ollamaMessages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.message.content;

    } catch (error) {
      console.error("Ollama Error:", error);
      throw new Error(`Falha ao se comunicar com o modelo local Ollama (${this.modelName}). Certifique-se de que o Ollama está rodando.`);
    }
  }
}
