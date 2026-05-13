import { describe, it, expect, vi } from 'vitest';
import { ProcessUserMessageUseCase } from './ProcessUserMessageUseCase';
import { IChatRepository } from '../types/IChatRepository';
import { IAIAssistantService } from '../types/IAIAssistantService';
import { ChatSession, Role } from '../types/Chat';

describe('ProcessUserMessageUseCase (Test Harness)', () => {
  it('should process a user message and return the AI response', async () => {
    // 1. MOCK REPOSITORY (Infrastructure Dependency)
    const mockSession: ChatSession = {
      id: 'session-123',
      userId: 'user-1',
      title: 'Dúvida sobre seguro',
      lastMessage: '',
      updatedAt: '',
      createdAt: '',
      messages: []
    };

    const mockChatRepo: IChatRepository = {
      getSession: vi.fn().mockResolvedValue(mockSession),
      saveMessage: vi.fn().mockResolvedValue(undefined),
      updateSession: vi.fn().mockResolvedValue(undefined)
    };

    // 2. MOCK AI SERVICE (Infrastructure Dependency)
    const mockAiService: IAIAssistantService = {
      generateResponse: vi.fn().mockResolvedValue('Olá! O seu seguro auto cobre acidentes pessoais.')
    };

    // 3. INJECT DEPENDENCIES INTO USE CASE
    const useCase = new ProcessUserMessageUseCase(mockChatRepo, mockAiService);

    // 4. EXECUTE (The actual Business Logic)
    const result = await useCase.execute('session-123', 'O que meu seguro cobre?');

    // 5. ASSERT (Verify behavior without hitting Firebase or Gemini)
    expect(mockChatRepo.getSession).toHaveBeenCalledWith('session-123');
    
    // Assert user message was saved
    expect(mockChatRepo.saveMessage).toHaveBeenNthCalledWith(1, 'session-123', expect.objectContaining({
      role: Role.USER,
      content: 'O que meu seguro cobre?'
    }));

    // Assert AI service was called
    expect(mockAiService.generateResponse).toHaveBeenCalled();

    // Assert AI message was saved
    expect(mockChatRepo.saveMessage).toHaveBeenNthCalledWith(2, 'session-123', expect.objectContaining({
      role: Role.MODEL,
      content: 'Olá! O seu seguro auto cobre acidentes pessoais.'
    }));

    // Check final result
    expect(result.role).toBe(Role.MODEL);
    expect(result.content).toBe('Olá! O seu seguro auto cobre acidentes pessoais.');
  });
});
