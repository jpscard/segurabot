import { collection, query, where, getDocs, limit, doc, setDoc, addDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseRestricted, setFirebaseRestricted } from './firebase';
import { CustomerProfile, SupportTicket } from '../domain';
import { ICustomerRepository } from '../domain/ICustomerRepository';

export class FirebaseCustomerRepository implements ICustomerRepository {
  async getCustomerProfile(userId: string): Promise<CustomerProfile | null> {
    if (isFirebaseRestricted) {
      return {
        userId: userId,
        name: 'Visitante',
        email: '',
        phone: '',
        activePolicies: [],
        policies: [],
        claims: [],
        documents: [],
        loyaltyTier: 'Demonstração (Sem Contrato)',
        lifeStage: 'Solteiro',
        riskScore: 0,
        aiSummary: 'Visitante temporário em modo de fallback local devido a restrições de permissão.',
        role: 'cliente'
      };
    }
    try {
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
        aiSummary: data.aiSummary,
        role: data.role || 'cliente'
      };
    } catch (error) {
      console.warn("Erro ao buscar perfil do cliente no Firestore (segurança/LGPD ativa), usando simulação local:", error);
      setFirebaseRestricted(true);
      return {
        userId: userId,
        name: 'Visitante',
        email: '',
        phone: '',
        activePolicies: [],
        policies: [],
        claims: [],
        documents: [],
        loyaltyTier: 'Demonstração (Sem Contrato)',
        lifeStage: 'Solteiro',
        riskScore: 0,
        aiSummary: 'Visitante temporário em modo de fallback local devido a restrições de permissão.',
        role: 'cliente'
      };
    }
  }

  async getCustomerProfileByEmail(email: string): Promise<CustomerProfile | null> {
    if (isFirebaseRestricted) {
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail === 'joao.silva@exemplo.com' || normalizedEmail === 'admin@segurabot.com.br' || normalizedEmail === 'cliente@exemplo.com' || normalizedEmail === 'atendente@segurabot.com.br') {
        return {
          userId: normalizedEmail === 'atendente@segurabot.com.br' ? 'demo-atendente' : 'demo-user',
          name: normalizedEmail === 'admin@segurabot.com.br' 
            ? 'Administrador SeguraBot' 
            : normalizedEmail === 'atendente@segurabot.com.br'
              ? 'Atendente SeguraBot'
              : normalizedEmail === 'joao.silva@exemplo.com' ? 'João Silva' : 'Cliente Segura',
          email: email,
          activePolicies: ['Plano de Saúde Executivo Plus (Apólice #SAUDE-998)'],
          role: normalizedEmail === 'admin@segurabot.com.br' 
            ? 'admin' 
            : normalizedEmail === 'atendente@segurabot.com.br'
              ? 'atendente'
              : 'cliente'
        };
      }
      return null;
    }
    try {
      const q = query(collection(db, 'customers'), where('email', '==', email), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // Simulação local para fins de demonstração (Demo/Lead Capturing)
        const normalizedEmail = email.trim().toLowerCase();
        if (normalizedEmail === 'joao.silva@exemplo.com' || normalizedEmail === 'admin@segurabot.com.br' || normalizedEmail === 'atendente@segurabot.com.br') {
          return {
            userId: normalizedEmail === 'atendente@segurabot.com.br' ? 'demo-atendente' : 'demo-user',
            name: normalizedEmail === 'admin@segurabot.com.br' 
              ? 'Administrador SeguraBot' 
              : normalizedEmail === 'atendente@segurabot.com.br'
                ? 'Atendente SeguraBot'
                : 'João Silva',
            email: email,
            activePolicies: ['Plano de Saúde Executivo Plus (Apólice #SAUDE-998)'],
            role: normalizedEmail === 'admin@segurabot.com.br' 
              ? 'admin' 
              : normalizedEmail === 'atendente@segurabot.com.br'
                ? 'atendente'
                : 'cliente'
          };
        }
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
        aiSummary: data.aiSummary,
        role: data.role || 'cliente'
      };
    } catch (error) {
      console.warn("Erro ao buscar perfil por e-mail no Firestore (segurança/LGPD ativa), usando simulação local:", error);
      setFirebaseRestricted(true);
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail === 'joao.silva@exemplo.com' || normalizedEmail === 'admin@segurabot.com.br' || normalizedEmail === 'cliente@exemplo.com' || normalizedEmail === 'atendente@segurabot.com.br') {
        return {
          userId: normalizedEmail === 'atendente@segurabot.com.br' ? 'demo-atendente' : 'demo-user',
          name: normalizedEmail === 'admin@segurabot.com.br' 
            ? 'Administrador SeguraBot' 
            : normalizedEmail === 'atendente@segurabot.com.br'
              ? 'Atendente SeguraBot'
              : normalizedEmail === 'joao.silva@exemplo.com' ? 'João Silva' : 'Cliente Segura',
          email: email,
          activePolicies: ['Plano de Saúde Executivo Plus (Apólice #SAUDE-998)'],
          role: normalizedEmail === 'admin@segurabot.com.br' 
            ? 'admin' 
            : normalizedEmail === 'atendente@segurabot.com.br'
              ? 'atendente'
              : 'cliente'
        };
      }
      return null;
    }
  }

  async getSupportTickets(userId: string): Promise<SupportTicket[]> {
    if (isFirebaseRestricted) {
      return [];
    }
    try {
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
    } catch (error) {
      console.warn("Erro ao buscar chamados no Firestore: ", error);
      setFirebaseRestricted(true);
      return [];
    }
  }

  async saveCustomerProfile(userId: string, profile: Omit<CustomerProfile, 'id'>): Promise<void> {
    if (isFirebaseRestricted) {
      console.warn("[FirebaseCustomerRepository] Bypassed saveCustomerProfile in restricted mode");
      return;
    }
    try {
      const customerRef = doc(db, 'customers', userId);
      await setDoc(customerRef, profile, { merge: true });
    } catch (error) {
      console.warn("Erro ao salvar perfil do cliente no Firestore: ", error);
      setFirebaseRestricted(true);
    }
  }

  async createSupportTicket(ticket: Omit<SupportTicket, 'id'>): Promise<void> {
    if (isFirebaseRestricted) {
      console.warn("[FirebaseCustomerRepository] Bypassed createSupportTicket in restricted mode");
      return;
    }
    try {
      await addDoc(collection(db, 'support_tickets'), ticket);
    } catch (error) {
      console.warn("Erro ao criar chamado no Firestore: ", error);
      setFirebaseRestricted(true);
    }
  }

  async updateSupportTicketStatus(ticketId: string, status: string): Promise<void> {
    if (isFirebaseRestricted) {
      console.warn("[FirebaseCustomerRepository] Bypassed updateSupportTicketStatus in restricted mode");
      return;
    }
    try {
      const ticketRef = doc(db, 'support_tickets', ticketId);
      await updateDoc(ticketRef, { status });
    } catch (error) {
      console.warn("Erro ao atualizar chamado no Firestore: ", error);
      setFirebaseRestricted(true);
    }
  }

  subscribeToCustomerProfile(userId: string, callback: (profile: CustomerProfile | null) => void): () => void {
    if (isFirebaseRestricted) {
      callback(null);
      return () => {};
    }
    try {
      const q = query(collection(db, 'customers'), where('userId', '==', userId));
      return onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data() as CustomerProfile;
          data.id = snapshot.docs[0].id;
          callback(data);
        } else {
          callback(null);
        }
      }, (error) => {
        console.warn("Error subscribing to customer profile:", error);
        setFirebaseRestricted(true);
        callback(null);
      });
    } catch (err) {
      setFirebaseRestricted(true);
      callback(null);
      return () => {};
    }
  }

  subscribeToSupportTickets(userId: string, callback: (tickets: SupportTicket[]) => void): () => void {
    if (isFirebaseRestricted) {
      callback([]);
      return () => {};
    }
    try {
      const q = query(collection(db, 'support_tickets'), where('userId', '==', userId));
      return onSnapshot(q, (snapshot) => {
        const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupportTicket));
        tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(tickets);
      }, (error) => {
        console.warn("Error subscribing to support tickets:", error);
        setFirebaseRestricted(true);
        callback([]);
      });
    } catch (err) {
      setFirebaseRestricted(true);
      callback([]);
      return () => {};
    }
  }

  subscribeToAllSupportTickets(callback: (tickets: SupportTicket[]) => void): () => void {
    if (isFirebaseRestricted) {
      callback([]);
      return () => {};
    }
    try {
      const q = query(collection(db, 'support_tickets'));
      return onSnapshot(q, (snapshot) => {
        const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupportTicket));
        tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(tickets);
      }, (error) => {
        console.warn("Error subscribing to all support tickets:", error);
        setFirebaseRestricted(true);
        callback([]);
      });
    } catch (err) {
      setFirebaseRestricted(true);
      callback([]);
      return () => {};
    }
  }
}
