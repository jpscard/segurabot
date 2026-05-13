import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError } from '../api/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, addDoc, updateDoc } from 'firebase/firestore';
import { CustomerProfile, SupportTicket, OperationType } from '../types';

export function CrmAdmin() {
  const user = auth.currentUser;
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulário Perfil
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [newPolicy, setNewPolicy] = useState('');
  const [policies, setPolicies] = useState<string[]>([]);
  const [tier, setTier] = useState('Padrão');

  // Formulário Ticket
  const [newSubject, setNewSubject] = useState('');

  useEffect(() => {
    if (!user) return;

    const profileUnsub = onSnapshot(
      query(collection(db, 'customers'), where('userId', '==', user.uid)),
      (snapshot) => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data() as CustomerProfile;
          data.id = snapshot.docs[0].id;
          setProfile(data);
          setName(data.name);
          setPhone(data.phone || '');
          setPolicies(data.activePolicies || []);
          setTier(data.loyaltyTier || 'Padrão');
        } else {
          setProfile(null);
          setName(user.displayName || 'Cliente Segura');
          setPolicies([]);
        }
        setLoading(false);
      }
    );

    const ticketsUnsub = onSnapshot(
      query(collection(db, 'support_tickets'), where('userId', '==', user.uid)),
      (snapshot) => {
        const t = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupportTicket));
        // Sort by date desc manually if not using an index
        t.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTickets(t);
      }
    );

    return () => {
      profileUnsub();
      ticketsUnsub();
    };
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    try {
      const customerRef = doc(db, 'customers', user.uid);
      await setDoc(customerRef, {
        userId: user.uid,
        email: user.email,
        name,
        phone,
        activePolicies: policies,
        loyaltyTier: tier
      }, { merge: true });
      alert('Perfil CRM salvo com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'customers');
    }
  };

  const addPolicy = () => {
    if (newPolicy.trim() && !policies.includes(newPolicy.trim())) {
      setPolicies([...policies, newPolicy.trim()]);
      setNewPolicy('');
    }
  };

  const removePolicy = (pol: string) => {
    setPolicies(policies.filter(p => p !== pol));
  };

  const createTicket = async () => {
    if (!user || !newSubject.trim()) return;
    try {
      await addDoc(collection(db, 'support_tickets'), {
        userId: user.uid,
        subject: newSubject.trim(),
        status: 'aberto',
        resolution: '',
        createdAt: new Date().toISOString()
      });
      setNewSubject('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'support_tickets');
    }
  };

  const updateTicketStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, 'support_tickets', id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'support_tickets');
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Carregando CRM...</div>;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Meu CRM (Simulador)</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Gerencie seu próprio perfil e histórico para testar a inteligência do SeguraBot.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Perfil Cliente */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="font-semibold text-lg text-slate-800 dark:text-slate-200">Dados do Cliente</h2>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Nome Completo</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200" />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Telefone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200" />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Categoria</label>
                <select value={tier} onChange={e => setTier(e.target.value)} className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200">
                  <option value="Padrão">Padrão</option>
                  <option value="Silver">Silver</option>
                  <option value="Gold">Gold</option>
                  <option value="Black">Black</option>
                </select>
              </div>

              <div className="pt-2">
                <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Apólices Ativas</label>
                <div className="flex gap-2 mb-3">
                  <input value={newPolicy} onChange={e => setNewPolicy(e.target.value)} placeholder="Ex: Seguro Auto Premium" className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200" />
                  <button onClick={addPolicy} className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">Adicionar</button>
                </div>
                <div className="space-y-2">
                  {policies.map(p => (
                    <div key={p} className="flex justify-between items-center bg-slate-100 dark:bg-slate-800/50 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300">
                      <span>{p}</span>
                      <button onClick={() => removePolicy(p)} className="text-red-500 hover:text-red-600 text-xs font-medium">Remover</button>
                    </div>
                  ))}
                  {policies.length === 0 && <p className="text-xs text-slate-400">Nenhuma apólice cadastrada.</p>}
                </div>
              </div>
            </div>

            <button onClick={saveProfile} className="w-full mt-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors">
              Salvar Dados no CRM
            </button>
          </div>

          {/* Histórico de Tickets */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col">
            <h2 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-4">Tickets de Suporte</h2>
            
            <div className="flex gap-2 mb-6">
              <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Novo assunto do ticket..." className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200" />
              <button onClick={createTicket} disabled={!newSubject.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">Abrir</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {tickets.map(t => (
                <div key={t.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{t.subject}</p>
                    <select 
                      value={t.status} 
                      onChange={e => updateTicketStatus(t.id!, e.target.value)}
                      className="bg-slate-100 dark:bg-slate-800 text-xs py-1 px-2 rounded-lg border-none outline-none text-slate-700 dark:text-slate-300"
                    >
                      <option value="aberto">Aberto</option>
                      <option value="em_andamento">Em Andamento</option>
                      <option value="fechado">Fechado</option>
                    </select>
                  </div>
                  {t.resolution && <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg">Resolução: {t.resolution}</p>}
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">{new Date(t.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
              {tickets.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Sem tickets registrados.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
