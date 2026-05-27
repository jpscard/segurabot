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
  sourceId?: string; // ID da fonte geradora
}

export interface KnowledgeSource {
  id?: string;
  name: string;
  type: 'pdf' | 'csv' | 'json' | 'web' | 'manual';
  status: 'processing' | 'completed' | 'error';
  chunkCount: number;
  createdAt: string;
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
  role?: 'cliente' | 'atendente' | 'admin';
}

export interface SupportTicket {
  id?: string;
  userId: string;
  subject: string;
  status: 'aberto' | 'em_andamento' | 'fechado';
  resolution?: string;
  createdAt: string;
}

export interface AnalyticsEvent {
  id?: string;
  eventType: 'page_view' | 'chat_click' | 'message_send' | 'conversion';
  sessionId: string;
  userId?: string;
  timestamp: string;
}

export interface AnalyticsSummary {
  totalVisitors: number;
  chatClicks: number;
  messageSends: number;
  conversions: number;
  bounceRate: number;
  eventsList: AnalyticsEvent[];
}
