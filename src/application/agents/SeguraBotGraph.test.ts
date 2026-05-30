import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSeguraBotGraph } from './SeguraBotGraph';
import { IChatRepository } from '../../domain/IChatRepository';
import { IAIAssistantService } from '../../domain/IAIAssistantService';
import { IKnowledgeBaseRepository } from '../../domain/IKnowledgeBaseRepository';
import { ICustomerRepository } from '../../domain/ICustomerRepository';
import { Role } from '../../domain/Chat';

// Mock fetch
global.fetch = vi.fn();

describe('SeguraBotGraph', () => {
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

    vi.clearAllMocks();
  });

  describe('Supervisor Node & Routing', () => {
    it('should bypass supervisor and route to handoff_agent if message contains human handover keywords', async () => {
      const graph = createSeguraBotGraph(mockChatRepo, mockAiService, mockKbRepo, mockCustomerRepo);
      
      const result = await graph.invoke({
        messages: [{ id: '1', role: Role.USER, content: 'Quero falar com um atendente humano por favor', timestamp: '' }],
        userId: 'u1',
        sessionId: 's1'
      });

      expect(result.nextAgent).toBe('handoff_agent');
      expect(result.finalResponse).toContain('transferindo o seu atendimento');
      expect(mockAiService.generateResponse).not.toHaveBeenCalled();
    });

    it('should route to knowledge_agent when supervisor AI output is knowledge_agent', async () => {
      const graph = createSeguraBotGraph(mockChatRepo, mockAiService, mockKbRepo, mockCustomerRepo);
      
      vi.mocked(mockKbRepo.searchRelevantContext).mockResolvedValue([
        { id: '1', category: 'saude', question: 'Cobre parto?', answer: 'Sim', source: 'faq' }
      ]);
      vi.mocked(mockAiService.generateResponse).mockImplementation(async (msgs, prompt) => {
        if (prompt.includes('Supervisor')) return 'knowledge_agent';
        return 'A resposta sobre parto é sim.';
      });

      const result = await graph.invoke({
        messages: [{ id: '1', role: Role.USER, content: 'Parto é coberto?', timestamp: '' }],
        userId: 'u1',
        sessionId: 's1'
      });

      expect(result.nextAgent).toBe('knowledge_agent');
      expect(result.finalResponse).toBe('A resposta sobre parto é sim.');
    });

    it('should route to support_agent when supervisor AI output is support_agent', async () => {
      const graph = createSeguraBotGraph(mockChatRepo, mockAiService, mockKbRepo, mockCustomerRepo);
      
      vi.mocked(mockCustomerRepo.getCustomerProfile).mockResolvedValue({
        id: 'u1',
        userId: 'u1',
        name: 'João Silva',
        email: 'joao@email.com',
        activePolicies: ['Saúde Ouro'],
        loyaltyTier: 'Gold'
      });
      vi.mocked(mockAiService.generateResponse).mockImplementation(async (msgs, prompt) => {
        if (prompt.includes('Supervisor')) return 'support_agent';
        return 'Olá João, sua apólice é Saúde Ouro.';
      });

      const result = await graph.invoke({
        messages: [{ id: '1', role: Role.USER, content: 'Qual minha apólice?', timestamp: '' }],
        userId: 'u1',
        sessionId: 's1'
      });

      expect(result.nextAgent).toBe('support_agent');
      expect(result.finalResponse).toBe('Olá João, sua apólice é Saúde Ouro.');
    });

    it('should fall back to keyword matching if supervisor AI call fails', async () => {
      const graph = createSeguraBotGraph(mockChatRepo, mockAiService, mockKbRepo, mockCustomerRepo);
      
      vi.mocked(mockKbRepo.searchRelevantContext).mockResolvedValue([]);
      
      vi.mocked(mockAiService.generateResponse).mockImplementation(async (msgs, prompt) => {
        if (prompt.includes('Supervisor')) throw new Error('AI Service Down');
        return 'Resposta baseada em regras.';
      });

      const result = await graph.invoke({
        messages: [{ id: '1', role: Role.USER, content: 'Qual o manual da minha cobertura?', timestamp: '' }],
        userId: 'u1',
        sessionId: 's1'
      });

      expect(result.nextAgent).toBe('knowledge_agent');
    });
  });

  describe('General Agent Node', () => {
    it('should call local Ollama endpoint and use its response', async () => {
      const graph = createSeguraBotGraph(mockChatRepo, mockAiService, mockKbRepo, mockCustomerRepo);
      
      vi.mocked(mockAiService.generateResponse).mockResolvedValue('general_agent');
      
      // Mock fetch response for Ollama
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ response: 'Olá, sou o Gemma da Ollama.' })
      });

      const result = await graph.invoke({
        messages: [{ id: '1', role: Role.USER, content: 'Olá tudo bem?', timestamp: '' }],
        userId: 'u1',
        sessionId: 's1'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.finalResponse).toBe('Olá, sou o Gemma da Ollama.');
    });

    it('should fall back to Gemini AI service if Ollama call fails', async () => {
      const graph = createSeguraBotGraph(mockChatRepo, mockAiService, mockKbRepo, mockCustomerRepo);
      
      vi.mocked(mockAiService.generateResponse).mockImplementation(async (msgs, prompt) => {
        if (prompt.includes('Supervisor')) return 'general_agent';
        return 'Olá do Gemini.';
      });

      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await graph.invoke({
        messages: [{ id: '1', role: Role.USER, content: 'Olá tudo bem?', timestamp: '' }],
        userId: 'u1',
        sessionId: 's1'
      });

      expect(result.finalResponse).toBe('Olá do Gemini.');
    });
  });

  describe('Handoff Agent Node', () => {
    it('should transition session to aguardando_humano status', async () => {
      const graph = createSeguraBotGraph(mockChatRepo, mockAiService, mockKbRepo, mockCustomerRepo);
      
      const mockSession = {
        id: 's1',
        userId: 'u1',
        title: 'Atendimento',
        lastMessage: 'Quero humano',
        createdAt: '',
        updatedAt: '',
        status: 'ia',
        messages: []
      };

      vi.mocked(mockChatRepo.getSession).mockResolvedValue(mockSession as any);
      vi.mocked(mockAiService.generateResponse).mockResolvedValue('handoff_agent');

      const result = await graph.invoke({
        messages: [{ id: '1', role: Role.USER, content: 'Quero falar com um humano agora', timestamp: '' }],
        userId: 'u1',
        sessionId: 's1'
      });

      expect(mockChatRepo.getSession).toHaveBeenCalledWith('u1', 's1');
      expect(mockChatRepo.updateSession).toHaveBeenCalledWith('u1', expect.objectContaining({
        status: 'aguardando_humano'
      }));
      expect(result.finalResponse).toContain('transferindo o seu atendimento');
    });
  });
});
