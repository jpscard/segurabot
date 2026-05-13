import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';
import { CustomerProfile, SupportTicket } from '../types';
import { ICustomerRepository } from '../types/ICustomerRepository';

export class FirebaseCustomerRepository implements ICustomerRepository {
  async getCustomerProfile(userId: string): Promise<CustomerProfile | null> {
    const q = query(collection(db, 'customers'), where('userId', '==', userId), limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const data = snapshot.docs[0].data();
    return {
      id: snapshot.docs[0].id,
      userId: data.userId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      activePolicies: data.activePolicies || [],
      loyaltyTier: data.loyaltyTier
    };
  }

  async getSupportTickets(userId: string): Promise<SupportTicket[]> {
    const q = query(collection(db, 'support_tickets'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    
    const tickets: SupportTicket[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      tickets.push({
        id: doc.id,
        userId: data.userId,
        subject: data.subject,
        status: data.status,
        resolution: data.resolution,
        createdAt: data.createdAt
      });
    });
    
    return tickets;
  }
}
