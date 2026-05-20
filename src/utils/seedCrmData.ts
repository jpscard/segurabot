import { setDoc, doc, collection, addDoc } from 'firebase/firestore';
import { db } from '../infrastructure/firebase';

export async function uploadRealCrmData(userId: string): Promise<void> {
  // 1. Criar perfil de cliente no CRM
  const customerRef = doc(db, 'customers', userId);
  await setDoc(customerRef, {
    userId: userId,
    name: "João Silva",
    email: "joao.silva@exemplo.com",
    phone: "(11) 98765-4321",
    activePolicies: ["Plano de Saúde Executivo Plus (Apólice #SAUDE-998)", "Seguro Odontológico Coletivo"],
    loyaltyTier: "Gold"
  });

  // 2. Criar histórico de tickets de suporte real
  const ticketsRef = collection(db, 'support_tickets');
  
  await addDoc(ticketsRef, {
    userId: userId,
    subject: "Dúvida sobre reembolso de consulta com especialista",
    status: "fechado",
    resolution: "Cliente orientado a enviar recibo médico e nota fiscal digital pelo app. O reembolso padrão é de até R$ 250,00 por consulta.",
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 dias atrás
  });

  await addDoc(ticketsRef, {
    userId: userId,
    subject: "Solicitação de autorização de exame de ressonância",
    status: "em_andamento",
    resolution: "",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 dias atrás
  });
}
