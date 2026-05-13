import { CustomerProfile, SupportTicket } from './index';

export interface ICustomerRepository {
  getCustomerProfile(userId: string): Promise<CustomerProfile | null>;
  getSupportTickets(userId: string): Promise<SupportTicket[]>;
}
