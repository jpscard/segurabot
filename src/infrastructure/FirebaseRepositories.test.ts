import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirebaseCustomerRepository } from './FirebaseCustomerRepository';
import { FirebaseChatRepository } from './FirebaseChatRepository';
import { FirebaseKnowledgeBaseRepository } from './FirebaseKnowledgeBaseRepository';
import { Role } from '../domain';
import { getDocs, getDoc, setDoc, addDoc, updateDoc } from 'firebase/firestore';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn().mockReturnValue({ id: 'collection' }),
    query: vi.fn().mockReturnValue({ id: 'query' }),
    where: vi.fn(),
    limit: vi.fn(),
    doc: vi.fn().mockReturnValue({ id: 'doc' }),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    getDocs: vi.fn(),
  };
});

// Mock the ./firebase file to avoid eager live connection tests
vi.mock('./firebase', () => {
  return {
    db: {},
    auth: { currentUser: { uid: 'user123' } }
  };
});

// Mock GeminiEmbeddingService in FirebaseKnowledgeBaseRepository
vi.mock('./GeminiEmbeddingService', () => {
  return {
    GeminiEmbeddingService: class {
      generateEmbedding = vi.fn().mockResolvedValue(new Array(768).fill(0.1));
    }
  };
});

describe('FirebaseCustomerRepository', () => {
  let repository: FirebaseCustomerRepository;

  beforeEach(() => {
    repository = new FirebaseCustomerRepository();
    vi.clearAllMocks();
  });

  it('getCustomerProfile should return profile if it exists', async () => {
    const mockDoc = {
      id: 'doc123',
      data: () => ({
        userId: 'user123',
        name: 'Cliente Teste',
        email: 'cliente@teste.com',
        activePolicies: ['Saúde Ouro'],
        loyaltyTier: 'Gold'
      })
    };
    
    vi.mocked(getDocs).mockResolvedValue({
      empty: false,
      docs: [mockDoc]
    } as any);

    const profile = await repository.getCustomerProfile('user123');

    expect(profile).not.toBeNull();
    expect(profile?.name).toBe('Cliente Teste');
    expect(profile?.activePolicies).toContain('Saúde Ouro');
  });

  it('getCustomerProfile should return null if it does not exist', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      empty: true,
      docs: []
    } as any);

    const profile = await repository.getCustomerProfile('user123');

    expect(profile).toBeNull();
  });

  it('saveCustomerProfile should call setDoc', async () => {
    await repository.saveCustomerProfile('user123', {
      userId: 'user123',
      name: 'Novo Nome',
      email: 'novo@email.com',
      phone: '12345',
      activePolicies: [],
      policies: [],
      claims: [],
      documents: [],
    });

    expect(setDoc).toHaveBeenCalled();
  });

  it('getSupportTickets should return tickets', async () => {
    const mockDocs = [
      {
        id: 't1',
        data: () => ({
          userId: 'user123',
          subject: 'Erro no app',
          status: 'aberto',
          resolution: '',
          createdAt: '2026-05-20'
        })
      }
    ];

    vi.mocked(getDocs).mockResolvedValue({
      empty: false,
      forEach: (cb: any) => mockDocs.forEach(cb as any)
    } as any);

    const tickets = await repository.getSupportTickets('user123');

    expect(tickets).toHaveLength(1);
    expect(tickets[0].subject).toBe('Erro no app');
  });
});

describe('FirebaseChatRepository', () => {
  let repository: FirebaseChatRepository;

  beforeEach(() => {
    repository = new FirebaseChatRepository();
    vi.clearAllMocks();
  });

  it('getSession should return session if it exists with messages', async () => {
    const mockSessionSnap = {
      exists: () => true,
      id: 'session123',
      data: () => ({
        title: 'Atendimento Especial',
        lastMessage: 'Olá',
        createdAt: '2026-05-20',
        updatedAt: '2026-05-20',
        status: 'ia'
      })
    };

    const mockMessageDocs = [
      {
        id: 'm1',
        data: () => ({
          role: Role.USER,
          content: 'Olá',
          timestamp: '2026-05-20T00:00:00Z',
          senderName: 'Cliente'
        })
      }
    ];

    vi.mocked(getDoc).mockResolvedValue(mockSessionSnap as any);
    vi.mocked(getDocs).mockResolvedValue({
      forEach: (cb: any) => mockMessageDocs.forEach(cb as any)
    } as any);

    const session = await repository.getSession('user123', 'session123');

    expect(session).not.toBeNull();
    expect(session?.title).toBe('Atendimento Especial');
    expect(session?.messages).toHaveLength(1);
    expect(session?.messages?.[0].content).toBe('Olá');
  });

  it('getSession should return null if it does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false
    } as any);

    const session = await repository.getSession('user123', 'session123');

    expect(session).toBeNull();
  });

  it('createSession should call addDoc and return new session', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'new_session_id' } as any);

    const session = await repository.createSession('user123', 'Nova sessão', 'Olá');

    expect(addDoc).toHaveBeenCalled();
    expect(session.id).toBe('new_session_id');
  });
});

describe('FirebaseKnowledgeBaseRepository', () => {
  let repository: FirebaseKnowledgeBaseRepository;

  beforeEach(() => {
    repository = new FirebaseKnowledgeBaseRepository();
    vi.clearAllMocks();
  });

  it('should return relevant context matched by similarity', async () => {
    const mockKbDocs = [
      {
        id: 'kb1',
        data: () => ({
          category: 'saude',
          question: 'Como funciona a carência?',
          answer: 'A carência é de 30 dias.',
          embedding: new Array(768).fill(0.1)
        })
      }
    ];

    vi.mocked(getDocs).mockResolvedValue({
      docs: mockKbDocs
    } as any);

    const docs = await repository.searchRelevantContext('carência');

    expect(docs).toHaveLength(1);
    expect(docs[0].answer).toContain('carência é de 30 dias');
  });
});
