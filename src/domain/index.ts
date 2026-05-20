export * from './Chat';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: string;
}

export interface KnowledgeBaseEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  source: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface Policy {
  id: string;
  type: string;
  assetDescription: string;
  coverageLimits: string;
  expirationDate: string;
  premiumValue: number;
}

export interface Claim {
  id: string;
  policyId: string;
  description: string;
  status: 'aberto' | 'em_analise' | 'vistoria' | 'aprovado' | 'pago' | 'recusado';
  openedAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  type: string;
  url: string;
  extractedData?: string; // Dados extraídos pela IA
  uploadedAt: string;
}

export interface CustomerProfile {
  id?: string;
  userId: string; // Firebase Auth UID
  name: string;
  email: string;
  phone?: string;
  activePolicies: string[]; // Legado (strings)
  policies?: Policy[]; // Nova estrutura detalhada
  claims?: Claim[]; // Histórico de sinistros
  documents?: DocumentRecord[]; // Documentos do cliente
  loyaltyTier?: string; 
  lifeStage?: string; // Para oportunidades de cross-sell
  riskScore?: number; // Indicador de Risco / LTV (0-100)
  aiSummary?: string; // Resumo gerado por IA do histórico
}

export interface SupportTicket {
  id?: string;
  userId: string;
  subject: string;
  status: 'aberto' | 'em_andamento' | 'fechado';
  resolution?: string;
  createdAt: string;
}
