import { describe, it, expect, vi, beforeEach } from 'vitest';
import { askSeguraBot } from './gemini';
import { Role } from '../types';

// Mock the environment variable
vi.stubEnv('VITE_GEMINI_API_KEY', 'fake_key');

// Mock fetch for Ollama tests
global.fetch = vi.fn();

// Mock GoogleGenAI
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContentStream: vi.fn().mockImplementation(async function* () {
          yield { text: 'Esta é uma resposta ' };
          yield { text: 'simulada do Gemini ' };
          yield { text: 'sobre seguros.' };
        })
      };
    }
  };
});

describe('askSeguraBot (AI Service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve usar o Gemini por padrão e processar a resposta', async () => {
    const messages = [{ id: '1', role: Role.USER, content: 'Como aciono meu seguro?', timestamp: Date.now() }];
    const onChunk = vi.fn();
    
    const response = await askSeguraBot(messages, onChunk, 'gemini');
    
    expect(response).toBe('Esta é uma resposta simulada do Gemini sobre seguros.');
    expect(onChunk).toHaveBeenCalledTimes(3);
    expect(onChunk).toHaveBeenNthCalledWith(1, 'Esta é uma resposta ');
  });

  it('deve usar o provedor Ollama e fazer o fetch corretamente', async () => {
    const messages = [{ id: '1', role: Role.USER, content: 'O que a apólice cobre?', timestamp: Date.now() }];
    const onChunk = vi.fn();
    
    // Setup fetch mock for streaming response
    const mockStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(JSON.stringify({ message: { content: 'Resposta ' } }) + '\n'));
        controller.enqueue(encoder.encode(JSON.stringify({ message: { content: 'Ollama.' } }) + '\n'));
        controller.close();
      }
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockStream.getReader()
      }
    });
    
    const response = await askSeguraBot(messages, onChunk, 'ollama');
    
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    
    expect(response).toBe('Resposta Ollama.');
    expect(onChunk).toHaveBeenCalledTimes(2);
  });

  it('deve lidar com falhas do provedor Ollama corretamente', async () => {
    const messages = [{ id: '1', role: Role.USER, content: 'Teste de erro', timestamp: Date.now() }];
    
    (global.fetch as any).mockResolvedValue({
      ok: false,
      statusText: 'Not Found'
    });
    
    await expect(askSeguraBot(messages, undefined, 'ollama')).rejects.toThrow('Ollama API error');
  });
});
