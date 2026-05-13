import { setDoc, doc, collection, addDoc } from 'firebase/firestore';
import { db } from '../api/firebase';

export async function uploadRealCrmData(userId: string): Promise<void> {
  // 1. Criar perfil de cliente no CRM
  const customerRef = doc(db, 'customers', userId);
  await setDoc(customerRef, {
    userId: userId,
    name: "João Silva", // Mock data representativo do real
    email: "joao.silva@exemplo.com",
    phone: "(11) 98765-4321",
    activePolicies: ["Seguro Auto Premium (Apólice #8892)", "Seguro Residencial Básico"],
    loyaltyTier: "Gold"
  });

  // 2. Criar histórico de tickets de suporte real
  const ticketsRef = collection(db, 'support_tickets');
  
  await addDoc(ticketsRef, {
    userId: userId,
    subject: "Dúvida sobre cobertura de vidros no Seguro Auto",
    status: "fechado",
    resolution: "Cliente informado que a quebra de vidros tem franquia reduzida de R$ 150,00.",
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 dias atrás
  });

  await addDoc(ticketsRef, {
    userId: userId,
    subject: "Atualização de endereço residencial",
    status: "em_andamento",
    resolution: "",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 dias atrás
  });
}
