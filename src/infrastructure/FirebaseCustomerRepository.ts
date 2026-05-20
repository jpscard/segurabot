import { collection, query, where, getDocs, limit, doc, setDoc, addDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { CustomerProfile, SupportTicket } from '../domain';
import { ICustomerRepository } from '../domain/ICustomerRepository';

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
      policies: data.policies || [],
      claims: data.claims || [],
      documents: data.documents || [],
      loyaltyTier: data.loyaltyTier,
      lifeStage: data.lifeStage,
      riskScore: data.riskScore,
      aiSummary: data.aiSummary
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

  async saveCustomerProfile(userId: string, profile: Omit<CustomerProfile, 'id'>): Promise<void> {
    const customerRef = doc(db, 'customers', userId);
    await setDoc(customerRef, profile, { merge: true });
  }

  async createSupportTicket(ticket: Omit<SupportTicket, 'id'>): Promise<void> {
    await addDoc(collection(db, 'support_tickets'), ticket);
  }

  async updateSupportTicketStatus(ticketId: string, status: string): Promise<void> {
    const ticketRef = doc(db, 'support_tickets', ticketId);
    await updateDoc(ticketRef, { status });
  }

  subscribeToCustomerProfile(userId: string, callback: (profile: CustomerProfile | null) => void): () => void {
    const q = query(collection(db, 'customers'), where('userId', '==', userId));
    return onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as CustomerProfile;
        data.id = snapshot.docs[0].id;
        callback(data);
      } else {
        callback(null);
      }
    });
  }

  subscribeToSupportTickets(userId: string, callback: (tickets: SupportTicket[]) => void): () => void {
    const q = query(collection(db, 'support_tickets'), where('userId', '==', userId));
    return onSnapshot(q, (snapshot) => {
      const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupportTicket));
      // Sort by date desc manually if not using an index
      tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(tickets);
    });
  }
}
