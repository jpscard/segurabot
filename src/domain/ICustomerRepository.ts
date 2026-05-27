import { CustomerProfile, SupportTicket } from './index';

export interface ICustomerRepository {
  getCustomerProfile(userId: string): Promise<CustomerProfile | null>;
  getCustomerProfileByEmail(email: string): Promise<CustomerProfile | null>;
  getSupportTickets(userId: string): Promise<SupportTicket[]>;
  saveCustomerProfile(userId: string, profile: Omit<CustomerProfile, 'id'>): Promise<void>;
  createSupportTicket(ticket: Omit<SupportTicket, 'id'>): Promise<void>;
  updateSupportTicketStatus(ticketId: string, status: string): Promise<void>;
  subscribeToCustomerProfile(userId: string, callback: (profile: CustomerProfile | null) => void): () => void;
  subscribeToSupportTickets(userId: string, callback: (tickets: SupportTicket[]) => void): () => void;
}
