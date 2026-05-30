import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessUserMessageUseCase } from './ProcessUserMessageUseCase';
import { IChatRepository } from '../domain/IChatRepository';
import { IAIAssistantService } from '../domain/IAIAssistantService';
import { IKnowledgeBaseRepository } from '../domain/IKnowledgeBaseRepository';
import { ICustomerRepository } from '../domain/ICustomerRepository';
import { ChatSession, Role, Message } from '../domain/Chat';
import { createSeguraBotGraph } from './agents/SeguraBotGraph';

vi.mock('./agents/SeguraBotGraph', () => ({
  createSeguraBotGraph: vi.fn()
}));

describe('ProcessUserMessageUseCase', () => {
  let useCase: ProcessUserMessageUseCase;
  let mockChatRepo: IChatRepository;
  let mockAiService: IAIAssistantService;
  let mockKbRepo: IKnowledgeBaseRepository;
  let mockCustomerRepo: ICustomerRepository;

  beforeEach(() => {
    mockChatRepo = {
      getSession: vi.fn(),
      saveMessage: vi.fn(),
      updateSession: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
      listenToSessions: vi.fn(),
      listenToAllSessions: vi.fn(),
      listenToMessages: vi.fn(),
    };

    mockAiService = {
      generateResponse: vi.fn(),
    };

    mockKbRepo = {
      searchRelevantContext: vi.fn(),
    };

    mockCustomerRepo = {
      getCustomerProfile: vi.fn(),
      getCustomerProfileByEmail: vi.fn(),
      getSupportTickets: vi.fn(),
      saveCustomerProfile: vi.fn(),
      createSupportTicket: vi.fn(),
      updateSupportTicketStatus: vi.fn(),
      subscribeToCustomerProfile: vi.fn(),
      subscribeToSupportTickets: vi.fn(),
      subscribeToAllSupportTickets: vi.fn(),
    };

    useCase = new ProcessUserMessageUseCase(
      mockChatRepo,
      mockAiService,
      mockKbRepo,
      mockCustomerRepo
    );

    vi.clearAllMocks();
  });

  it('should process user message using graph and return AI response', async () => {
    const userId = 'user123';
    const sessionId = 'session123';
    const message = 'Olá';
    
    const mockSession: ChatSession = {
      id: sessionId,
      userId: userId,
      title: 'Teste',
      lastMessage: '',
      createdAt: '',
      updatedAt: '',
      messages: [],
    };

    vi.mocked(mockChatRepo.getSession).mockResolvedValue(mockSession);
    
    const mockInvoke = vi.fn().mockResolvedValue({ finalResponse: 'Resposta da IA' });
    vi.mocked(createSeguraBotGraph).mockReturnValue({ invoke: mockInvoke } as any);

    const result = await useCase.execute(userId, sessionId, message);

    expect(mockChatRepo.getSession).toHaveBeenCalledWith(userId, sessionId);
    expect(createSeguraBotGraph).toHaveBeenCalledWith(mockChatRepo, mockAiService, mockKbRepo, mockCustomerRepo);
    expect(mockInvoke).toHaveBeenCalledWith({
      messages: expect.any(Array),
      userId: userId,
      sessionId: sessionId
    });
    expect(mockChatRepo.saveMessage).toHaveBeenCalledTimes(2); // User and AI message
    expect(mockChatRepo.updateSession).toHaveBeenCalled();
    expect(result.content).toBe('Resposta da IA');
  });

  it('should create a new session if it does not exist', async () => {
    const userId = 'user123';
    const sessionId = 'newSession123';
    const message = 'Nova pergunta';
    
    vi.mocked(mockChatRepo.getSession).mockResolvedValue(null);
    
    const mockInvoke = vi.fn().mockResolvedValue({ finalResponse: 'Resposta da IA' });
    vi.mocked(createSeguraBotGraph).mockReturnValue({ invoke: mockInvoke } as any);

    await useCase.execute(userId, sessionId, message);

    expect(mockChatRepo.updateSession).toHaveBeenCalledTimes(2); // Once for initialization, once for closing
    expect(mockChatRepo.updateSession).toHaveBeenNthCalledWith(1, userId, expect.objectContaining({
      id: sessionId,
      title: 'Nova Conversa'
    }));
  });

  it('should propagate error if graph invoke fails', async () => {
    const userId = 'user123';
    const sessionId = 'session123';
    const message = 'Olá';
    
    vi.mocked(mockChatRepo.getSession).mockResolvedValue({
      id: sessionId,
      userId,
      title: 'Teste',
      lastMessage: '',
      createdAt: '',
      updatedAt: '',
      messages: []
    });
    
    const error = new Error('Graph execution failed');
    const mockInvoke = vi.fn().mockRejectedValue(error);
    vi.mocked(createSeguraBotGraph).mockReturnValue({ invoke: mockInvoke } as any);

    await expect(useCase.execute(userId, sessionId, message)).rejects.toThrow('Graph execution failed');
    
    // Deve salvar a mensagem do usuário mas não a da IA
    expect(mockChatRepo.saveMessage).toHaveBeenCalledTimes(1);
    expect(mockChatRepo.saveMessage).toHaveBeenCalledWith(userId, sessionId, expect.objectContaining({
      role: Role.USER
    }));
  });
});
