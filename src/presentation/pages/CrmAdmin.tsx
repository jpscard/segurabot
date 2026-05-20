import { useState, useEffect } from 'react';
import { auth, handleFirestoreError } from '../../infrastructure/firebase';
import { FirebaseCustomerRepository } from '../../infrastructure/FirebaseCustomerRepository';
import { FirebaseChatRepository } from '../../infrastructure/FirebaseChatRepository';
import { CustomerProfile, SupportTicket, OperationType, Policy, Claim, DocumentRecord } from '../../domain';
import { ChatSession, Message, Role } from '../../domain/Chat';

export function CrmAdmin() {
  const user = auth.currentUser;
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Navegação por abas
  const [activeTab, setActiveTab] = useState<'dados' | 'chamados' | 'chat'>('dados');

  // Formulário Perfil
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [newPolicy, setNewPolicy] = useState('');
  const [policies, setPolicies] = useState<string[]>([]);
  const [detailedPolicies, setDetailedPolicies] = useState<Policy[]>([]);
  const [claimsList, setClaimsList] = useState<Claim[]>([]);
  const [documentsList, setDocumentsList] = useState<DocumentRecord[]>([]);
  const [tier, setTier] = useState('Padrão');
  const [lifeStage, setLifeStage] = useState('');
  const [riskScore, setRiskScore] = useState(0);
  const [aiSummary, setAiSummary] = useState('');

  // Formulário Ticket
  const [newSubject, setNewSubject] = useState('');

  // Estados do Chat em Tempo Real
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');

  const customerRepo = new FirebaseCustomerRepository();
  const chatRepo = new FirebaseChatRepository();

  useEffect(() => {
    if (!user) return;

    const profileUnsub = customerRepo.subscribeToCustomerProfile(user.uid, (data) => {
      if (data) {
        setProfile(data);
        setName(data.name);
        setPhone(data.phone || '');
        setPolicies(data.activePolicies || []);
        setDetailedPolicies(data.policies || []);
        setClaimsList(data.claims || []);
        setDocumentsList(data.documents || []);
        setTier(data.loyaltyTier || 'Padrão');
        setLifeStage(data.lifeStage || '');
        setRiskScore(data.riskScore || 0);
        setAiSummary(data.aiSummary || '');
      } else {
        setProfile(null);
        setName(user.displayName || 'Cliente Segura');
        setPolicies([]);
        setDetailedPolicies([]);
        setClaimsList([]);
        setDocumentsList([]);
        setLifeStage('');
        setRiskScore(0);
        setAiSummary('');
      }
      setLoading(false);
    });

    const ticketsUnsub = customerRepo.subscribeToSupportTickets(user.uid, (t) => {
      setTickets(t);
    });

    const sessionsUnsub = chatRepo.listenToSessions(user.uid, (data) => {
      setSessions(data);
    }, (error) => {
      console.error("Erro ao escutar sessões no CRM:", error);
    });

    return () => {
      profileUnsub();
      ticketsUnsub();
      sessionsUnsub();
    };
  }, [user]);

  // Escuta mensagens do chat em tempo real selecionado
  useEffect(() => {
    if (!user || !selectedSession) {
      setSessionMessages([]);
      return;
    }

    const msgsUnsub = chatRepo.listenToMessages(user.uid, selectedSession.id, (data) => {
      setSessionMessages(data);
    }, (error) => {
      console.error("Erro ao escutar mensagens no CRM:", error);
    });

    return () => {
      msgsUnsub();
    };
  }, [user, selectedSession]);

  const saveProfile = async () => {
    if (!user) return;
    try {
      await customerRepo.saveCustomerProfile(user.uid, {
        userId: user.uid,
        email: user.email || '',
        name,
        phone,
        activePolicies: policies,
        policies: detailedPolicies,
        claims: claimsList,
        documents: documentsList,
        loyaltyTier: tier,
        lifeStage,
        riskScore,
        aiSummary
      });
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

  const addDetailedPolicy = () => {
    setDetailedPolicies([...detailedPolicies, {
      id: Date.now().toString(),
      type: 'Auto',
      assetDescription: 'Novo Veículo',
      coverageLimits: '100k',
      expirationDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      premiumValue: 1500
    }]);
  };

  const removeDetailedPolicy = (id: string) => {
    setDetailedPolicies(detailedPolicies.filter(p => p.id !== id));
  };

  const addClaim = () => {
    setClaimsList([...claimsList, {
      id: Date.now().toString(),
      policyId: detailedPolicies[0]?.id || 'sem-apolice',
      description: 'Colisão traseira',
      status: 'aberto',
      openedAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0]
    }]);
  };

  const removeClaim = (id: string) => {
    setClaimsList(claimsList.filter(c => c.id !== id));
  };

  const addDocument = () => {
    setDocumentsList([...documentsList, {
      id: Date.now().toString(),
      type: 'CNH',
      url: 'https://exemplo.com/doc.pdf',
      uploadedAt: new Date().toISOString().split('T')[0]
    }]);
  };

  const removeDocument = (id: string) => {
    setDocumentsList(documentsList.filter(d => d.id !== id));
  };

  const generateAiSummary = () => {
    setAiSummary('Cliente desde 2021. Costuma acionar o seguro para pequenos reparos residenciais. Atualmente na fase "Casado", boa oportunidade para Seguro de Vida e Previdência. Último contato foi amigável, mas reclamou de lentidão na vistoria.');
  };

  const extractDataFromDoc = (id: string) => {
    const newDocs = [...documentsList];
    const idx = newDocs.findIndex(d => d.id === id);
    if (idx > -1) {
      newDocs[idx].extractedData = 'Nome: João Paulo, Categoria B, Validade 2030';
      setDocumentsList(newDocs);
    }
  };

  const createTicket = async () => {
    if (!user || !newSubject.trim()) return;
    try {
      await customerRepo.createSupportTicket({
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
      await customerRepo.updateSupportTicketStatus(id, status);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'support_tickets');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F6F6F6] dark:bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[#5E81F4] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold tracking-widest text-[#8181A5] uppercase font-sans">Carregando CRM...</span>
        </div>
      </div>
    );
  }

  const loyaltyTiers = ['Padrão', 'Silver', 'Gold', 'Black'];
  const lifeStages = ['Solteiro', 'Casado', 'Com filhos', 'Aposentado'];
  const claimStatuses: { value: Claim['status']; label: string }[] = [
    { value: 'aberto', label: 'Aberto' },
    { value: 'em_analise', label: 'Em Análise' },
    { value: 'vistoria', label: 'Vistoria' },
    { value: 'aprovado', label: 'Aprovado' },
    { value: 'pago', label: 'Pago' },
    { value: 'recusado', label: 'Recusado' }
  ];

  // Helper stats
  const activeDetailedPoliciesCount = detailedPolicies.length;
  const openClaimsCount = claimsList.filter(c => c.status !== 'pago' && c.status !== 'recusado').length;
  const openTicketsCount = tickets.filter(t => t.status !== 'fechado').length;

  // Render do painel de chat em tempo real
  const renderLiveChatTab = () => {
    const handleTakeover = async (session: ChatSession) => {
      const updated: ChatSession = {
        ...session,
        status: 'humano',
        operatorName: 'Leonardo Alves Pereira'
      };
      try {
        await chatRepo.updateSession(user!.uid, updated);
        const sysMsg: Message = {
          role: Role.MODEL,
          content: "O atendente Leonardo Alves Pereira assumiu o atendimento.",
          timestamp: new Date().toISOString(),
          senderName: "Sistema"
        };
        await chatRepo.saveMessage(user!.uid, session.id, sysMsg);
        setSelectedSession(updated);
      } catch (err) {
        console.error("Erro ao assumir atendimento:", err);
      }
    };

    const handleRelease = async (session: ChatSession) => {
      const updated: ChatSession = {
        ...session,
        status: 'ia',
        operatorName: ''
      };
      try {
        await chatRepo.updateSession(user!.uid, updated);
        const sysMsg: Message = {
          role: Role.MODEL,
          content: "O atendimento foi devolvido para o assistente virtual de IA.",
          timestamp: new Date().toISOString(),
          senderName: "Sistema"
        };
        await chatRepo.saveMessage(user!.uid, session.id, sysMsg);
        setSelectedSession(updated);
      } catch (err) {
        console.error("Erro ao devolver atendimento para IA:", err);
      }
    };

    const handleSendLiveMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim() || !selectedSession || !user) return;

      const operatorMsg: Message = {
        role: Role.MODEL,
        content: chatInput,
        timestamp: new Date().toISOString(),
        senderName: "Leonardo Alves Pereira"
      };

      try {
        await chatRepo.saveMessage(user.uid, selectedSession.id, operatorMsg);
        const updatedSession = {
          ...selectedSession,
          lastMessage: chatInput,
          updatedAt: new Date().toISOString()
        };
        await chatRepo.updateSession(user.uid, updatedSession);
        setChatInput('');
      } catch (err) {
        console.error("Erro ao enviar mensagem no CRM:", err);
      }
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[600px] bg-white dark:bg-slate-900 rounded-2xl border border-[#ECECF2] dark:border-slate-800 overflow-hidden shadow-sm animate-fadeIn">
        {/* Painel Esquerdo: Lista de Conversas (col-span-4) */}
        <div className="lg:col-span-4 border-r border-[#ECECF2] dark:border-slate-800 flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/20 select-none">
          <div className="p-4 border-b border-[#ECECF2] dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Conversas Ativas
            </h3>
            <p className="text-[10px] text-[#8181A5] mt-1">
              Monitore os chats e assuma o controle quando necessário.
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto divide-y divide-[#ECECF2] dark:divide-slate-800/60">
            {sessions.map(s => {
              const isSelected = selectedSession?.id === s.id;
              
              let statusLabel = 'IA';
              let statusClass = 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-transparent';
              
              if (s.status === 'aguardando_humano') {
                statusLabel = 'Aguardando';
                statusClass = 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-transparent';
              } else if (s.status === 'humano') {
                statusLabel = 'Operador';
                statusClass = 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100/50 dark:border-transparent';
              }

              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSession(s)}
                  className={`w-full text-left p-4 transition-all duration-200 focus:outline-none flex flex-col gap-2 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 cursor-pointer ${
                    isSelected ? 'bg-white dark:bg-slate-805 shadow-inner border-l-2 border-blue-600' : ''
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate pr-2 max-w-[150px]">
                      {s.title}
                    </span>
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                  
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate w-full font-normal">
                    {s.lastMessage || 'Nenhuma mensagem ainda...'}
                  </p>
                  
                  <span className="text-[8px] font-mono text-slate-400 self-end font-semibold">
                    {s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                  </span>
                </button>
              );
            })}
            
            {sessions.length === 0 && (
              <div className="p-8 text-center text-xs text-[#8181A5] italic">
                Nenhuma conversa iniciada.
              </div>
            )}
          </div>
        </div>

        {/* Painel Direito: Chat Selecionado (col-span-8) */}
        <div className="lg:col-span-8 flex flex-col h-full bg-white dark:bg-slate-900">
          {selectedSession ? (
            <>
              {/* Header do Chat Selecionado */}
              <div className="p-4 border-b border-[#ECECF2] dark:border-slate-800 flex justify-between items-center bg-slate-50/20 shrink-0">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    {selectedSession.title}
                  </h4>
                  <p className="text-[9px] text-[#8181A5] mt-0.5 font-mono font-semibold">
                    Sessão: {selectedSession.id}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 select-none">
                  {selectedSession.status === 'humano' ? (
                    <button
                      onClick={() => handleRelease(selectedSession)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border border-slate-200/50 dark:border-slate-700"
                    >
                      Devolver para IA
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTakeover(selectedSession)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
                    >
                      Assumir Conversa
                    </button>
                  )}
                </div>
              </div>

              {/* Histórico de Mensagens */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/10 dark:bg-transparent">
                {sessionMessages.map((msg, i) => {
                  const isUser = msg.role === Role.USER;
                  const isSystem = msg.senderName === "Sistema";
                  
                  if (isSystem) {
                    return (
                      <div key={msg.id || i} className="flex justify-center my-2 select-none">
                        <span className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-[9px] font-mono uppercase tracking-wider text-center max-w-md border border-slate-250/20 dark:border-transparent">
                          {msg.content}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id || i}
                      className={`flex gap-3 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-[10px] shadow-sm select-none ${
                        isUser 
                          ? 'bg-slate-900 dark:bg-slate-800 text-white' 
                          : msg.senderName 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-[#5E81F4] text-white'
                      }`}>
                        {isUser ? 'U' : msg.senderName ? 'A' : 'B'}
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        {!isUser && (
                          <span className="text-[8px] font-bold uppercase tracking-wider text-[#8181A5] font-mono">
                            {msg.senderName ? `Corretor: ${msg.senderName}` : 'Assistente IA'}
                          </span>
                        )}
                        <div className={`p-3.5 rounded-2xl text-[11px] leading-relaxed shadow-sm font-normal ${
                          isUser 
                            ? 'bg-slate-800 text-white rounded-tr-none' 
                            : 'bg-white dark:bg-slate-850 border border-[#ECECF2] dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Caixa de Digitação Direta */}
              <div className="p-4 border-t border-[#ECECF2] dark:border-slate-800 shrink-0">
                <form onSubmit={handleSendLiveMessage} className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    disabled={selectedSession.status !== 'humano'}
                    placeholder={
                      selectedSession.status === 'humano'
                        ? "Digite sua resposta em tempo real..."
                        : "Você precisa 'Assumir Conversa' para responder a este cliente."
                    }
                    className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs outline-none focus:border-indigo-500/80 dark:focus:border-indigo-500/40 text-slate-700 dark:text-slate-200 disabled:opacity-60 transition-all placeholder:text-[#8181A5]/50"
                  />
                  <button
                    type="submit"
                    disabled={selectedSession.status !== 'humano' || !chatInput.trim()}
                    className="px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors disabled:opacity-50 shrink-0 cursor-pointer shadow-sm"
                  >
                    Enviar
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
              <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl flex items-center justify-center text-indigo-500 dark:text-indigo-400 border border-indigo-100/30 dark:border-transparent shrink-0 font-bold text-lg">
                C
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-4 uppercase tracking-wider">
                Nenhum Chat Selecionado
              </h3>
              <p className="text-[11px] text-[#8181A5] dark:text-slate-400 mt-2 max-w-xs leading-relaxed font-normal">
                Selecione uma das conversas ativas no painel esquerdo para ler o histórico completo e interagir.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F6F6F6] dark:bg-slate-950 p-6 md:p-10 scrollbar-thin font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-[#ECECF2] dark:border-slate-800 pb-6 select-none">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">
              Simulador de CRM Omnichannel
            </h1>
            <p className="text-sm text-[#8181A5] dark:text-slate-400 leading-relaxed max-w-2xl font-normal">
              Gerencie seus próprios dados cadastrais, contratos de seguro e sinistros para moldar as respostas de inteligência artificial do SeguraBot em tempo real.
            </p>
          </div>
          {activeTab === 'dados' && (
            <button 
              onClick={saveProfile} 
              className="px-6 py-3 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white rounded-lg text-sm font-bold tracking-wide transition-all duration-200 shadow-sm shadow-[#5E81F4]/10 hover:shadow-md shrink-0 cursor-pointer"
            >
              Salvar Alterações
            </button>
          )}
        </div>

        {/* Dashboard Quick Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 select-none">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm">
            <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Fidelidade</span>
            <div className="flex items-baseline gap-2 mt-3">
              <span className="text-xl font-bold text-[#9698D6]">{tier}</span>
              <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Tier</span>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm">
            <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Apólices Ativas</span>
            <div className="flex items-baseline gap-2 mt-3">
              <span className="text-xl font-bold text-[#5E81F4]">{activeDetailedPoliciesCount}</span>
              <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Contratos</span>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm">
            <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Sinistros Abertos</span>
            <div className="flex items-baseline gap-2 mt-3">
              <span className="text-xl font-bold text-[#F4BE5E]">{openClaimsCount}</span>
              <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Em Trâmite</span>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#ECECF2] dark:border-slate-800 flex flex-col justify-between shadow-sm">
            <span className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Chamados Ativos</span>
            <div className="flex items-baseline gap-2 mt-3">
              <span className="text-xl font-bold text-[#9698D6]">{openTicketsCount}</span>
              <span className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Pendentes</span>
            </div>
          </div>
        </div>

        {/* Tabs Navigation (Stylized buttons - NO EMOJIS, NO ICONS) */}
        <div className="flex flex-wrap gap-2.5 border-b border-[#ECECF2] dark:border-slate-800 pb-3 select-none">
          <button
            onClick={() => setActiveTab('dados')}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              activeTab === 'dados'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-[#ECECF2] dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Dados e Contratos
          </button>
          
          <button
            onClick={() => setActiveTab('chamados')}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              activeTab === 'chamados'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-[#ECECF2] dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Chamados de Suporte
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-[#ECECF2] dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Chat em Tempo Real
          </button>
        </div>

        {/* Tab 1: Dados e Contratos */}
        {activeTab === 'dados' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
            
            {/* Column 1: Profile, Coverage & Documents - col-span-7 */}
            <div className="lg:col-span-7 space-y-8">
              
              {/* Dados Básicos */}
              <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow duration-300">
                <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                  <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Dados Básicos do Cliente</h2>
                </div>
                
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider block">Nome Completo</label>
                      <input 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        className="w-full px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 transition-all font-normal placeholder:text-[#8181A5]/50"
                        placeholder="Nome do Segurado"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider block">Telefone de Contato</label>
                      <input 
                        value={phone} 
                        onChange={e => setPhone(e.target.value)} 
                        className="w-full px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 transition-all font-normal placeholder:text-[#8181A5]/50"
                        placeholder="(XX) XXXXX-XXXX"
                      />
                    </div>
                  </div>

                  {/* Loyalty Tier Selector (Stylized Buttons) */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider block">Nível de Fidelidade (Loyalty Tier)</label>
                    <div className="flex flex-wrap gap-2">
                      {loyaltyTiers.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTier(t)}
                          className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all duration-200 cursor-pointer ${
                            tier === t 
                              ? 'bg-slate-900 dark:bg-slate-800 text-white shadow-sm' 
                              : 'bg-[#F6F6F6] dark:bg-slate-950 text-[#8181A5] hover:bg-[#ECECF2] dark:hover:bg-slate-900 border border-transparent dark:border-slate-800'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Life Stage Selector (Stylized Buttons) */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider block">Fase da Vida (Life Stage)</label>
                    <div className="flex flex-wrap gap-2">
                      {lifeStages.map(stage => (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => setLifeStage(stage)}
                          className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                            lifeStage === stage 
                              ? 'bg-slate-900 dark:bg-slate-800 text-white shadow-sm' 
                              : 'bg-[#F6F6F6] dark:bg-slate-950 text-[#8181A5] hover:bg-[#ECECF2] dark:hover:bg-slate-900 border border-transparent dark:border-slate-800'
                          }`}
                        >
                          {stage}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Risk Score */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-[#8181A5] uppercase tracking-wider">Score de Risco Sinistral (Risk Score: {riskScore}%)</label>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono ${
                        riskScore < 30 ? 'bg-[#7CE7AC]/15 text-[#7CE7AC]' : riskScore < 70 ? 'bg-[#F4BE5E]/15 text-[#F4BE5E]' : 'bg-[#FF808B]/15 text-[#FF808B]'
                      }`}>
                        {riskScore < 30 ? 'Baixo' : riskScore < 70 ? 'Médio' : 'Alto Risco'}
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={riskScore} 
                      onChange={e => setRiskScore(parseInt(e.target.value))} 
                      className="w-full h-1.5 bg-[#ECECF2] dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#5E81F4]" 
                    />
                  </div>
                </div>
              </section>

              {/* Apólices Ativas Simples (Tags) */}
              <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-5 hover:shadow-md transition-shadow duration-300">
                <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                  <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Apólices Ativas (Tags de Roteamento)</h2>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input 
                      value={newPolicy} 
                      onChange={e => setNewPolicy(e.target.value)} 
                      placeholder="Ex: Vida, Viagem, Residencial..." 
                      className="flex-1 px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 transition-all font-normal placeholder:text-[#8181A5]/50"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPolicy(); } }}
                    />
                    <button 
                      onClick={addPolicy} 
                      className="px-5 py-3 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white rounded-lg text-xs font-bold transition-all shrink-0 shadow-sm cursor-pointer"
                    >
                      Adicionar
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {policies.map(p => (
                      <span 
                        key={p} 
                        className="pl-3 pr-2 py-1.5 bg-[#F6F6F6] dark:bg-slate-800 rounded-lg border border-[#ECECF2] dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-bold flex items-center gap-2 select-none group"
                      >
                        {p}
                        <button 
                          onClick={() => removePolicy(p)} 
                          className="text-[#FF808B] hover:text-red-700 transition-colors font-bold text-[10px] cursor-pointer"
                        >
                          x
                        </button>
                      </span>
                    ))}
                    {policies.length === 0 && (
                      <p className="text-xs text-[#8181A5] dark:text-slate-500 italic">Nenhuma apólice vinculada ao cliente.</p>
                    )}
                  </div>
                </div>
              </section>

              {/* Documentos Digitalizados */}
              <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                  <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Documentos Digitalizados (OCR)</h2>
                  <button 
                    onClick={addDocument} 
                    className="text-xs font-bold text-[#5E81F4] hover:text-[#5E81F4]/80 transition-colors cursor-pointer"
                  >
                    Anexar Documento
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {documentsList.map((d, idx) => (
                    <div 
                      key={d.id} 
                      className="p-5 bg-[#F6F6F6] dark:bg-slate-850 rounded-lg border border-[#ECECF2] dark:border-slate-800 relative group flex flex-col justify-between gap-4"
                    >
                      <button 
                        onClick={() => removeDocument(d.id)} 
                        className="absolute top-4 right-4 text-xs font-bold text-[#FF808B] hover:text-[#FF808B]/80 transition-colors cursor-pointer"
                        title="Remover Documento"
                      >
                        Excluir
                      </button>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Tipo de Documento</label>
                          <select 
                            value={d.type} 
                            onChange={e => {
                              const newDocs = [...documentsList];
                              newDocs[idx].type = e.target.value;
                              setDocumentsList(newDocs);
                            }} 
                            className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-350 font-bold outline-none cursor-pointer"
                          >
                            <option value="CNH">CNH (Motorista)</option>
                            <option value="CRLV">CRLV (Veículo)</option>
                            <option value="RG">RG (Identidade)</option>
                            <option value="Comprovante">Comprovante de Residência</option>
                            <option value="Laudo">Laudo Médico (Saúde)</option>
                            <option value="Outro">Outro Documento</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Dados Extraídos (OCR)</label>
                          <p className="text-[11px] text-slate-700 dark:text-slate-300 font-bold leading-normal bg-white dark:bg-slate-900 p-2.5 rounded border border-[#ECECF2] dark:border-slate-800 min-h-[36px]">
                            {d.extractedData || <span className="text-[#8181A5] font-normal italic">Dados não extraídos. Clique no botão abaixo para processar.</span>}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => extractDataFromDoc(d.id)}
                        className="w-full py-2 bg-slate-900 dark:bg-slate-850 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm cursor-pointer"
                      >
                        Simular OCR Inteligente
                      </button>
                    </div>
                  ))}

                  {documentsList.length === 0 && (
                    <div className="col-span-2 text-center py-8 border border-dashed border-[#ECECF2] dark:border-slate-800 rounded-lg bg-[#F6F6F6]/30 dark:bg-transparent">
                      <p className="text-xs text-[#8181A5] dark:text-slate-500 italic">Nenhum documento digitalizado. Anexe arquivos acima para simular a extração OCR.</p>
                    </div>
                  )}
                </div>
              </section>

            </div>

            {/* Column 2: Advanced Policies, Claims, AI Summary & Support - col-span-5 */}
            <div className="lg:col-span-5 space-y-8">
              
              {/* Resumo Omnichannel (IA) */}
              <section className="bg-gradient-to-br from-indigo-500/5 to-purple-500/5 dark:from-indigo-500/5 dark:to-purple-500/5 p-6 rounded-lg shadow-sm border border-[#9698D6]/30 dark:border-purple-900/30 space-y-5 hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Resumo Omnichannel AI</h2>
                  <button 
                    onClick={generateAiSummary} 
                    className="px-4 py-2 bg-white hover:bg-[#F6F6F6] text-[#9698D6] rounded-lg text-xs font-bold transition-all border border-[#ECECF2] cursor-pointer"
                  >
                    Consolidar Histórico
                  </button>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    Este bloco armazena o dossiê do cliente resumido dinamicamente por IA para dar contexto instantâneo ao chatbot em qualquer canal (Chat, WhatsApp, Voz).
                  </p>
                  
                  <textarea 
                    value={aiSummary} 
                    onChange={e => setAiSummary(e.target.value)} 
                    rows={5} 
                    placeholder="Cole ou gere o resumo analítico da IA aqui..." 
                    className="w-full px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none focus:border-[#5E81F4] text-slate-700 dark:text-slate-350 transition-all leading-relaxed font-bold"
                  />
                </div>
              </section>

              {/* Apólices Detalhadas (Advanced Policies) */}
              <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                  <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Contratos de Seguro (Apólices)</h2>
                  <button 
                    onClick={addDetailedPolicy} 
                    className="text-xs font-bold text-[#5E81F4] hover:text-[#5E81F4]/80 transition-colors cursor-pointer"
                  >
                    Novo Contrato
                  </button>
                </div>

                <div className="space-y-5">
                  {detailedPolicies.map((p, idx) => (
                    <div 
                      key={p.id} 
                      className="p-5 bg-[#F6F6F6] dark:bg-blue-500/[0.02] rounded-lg border border-[#ECECF2] dark:border-blue-900/20 space-y-4 relative group"
                    >
                      <button 
                        onClick={() => removeDetailedPolicy(p.id)} 
                        className="absolute top-4 right-4 text-xs font-bold text-[#FF808B] hover:text-[#FF808B]/80 transition-colors cursor-pointer"
                        title="Remover Apólice"
                      >
                        Excluir
                      </button>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Ramo de Cobertura</label>
                          <select 
                            value={p.type} 
                            onChange={e => {
                              const newPolicies = [...detailedPolicies];
                              newPolicies[idx].type = e.target.value;
                              setDetailedPolicies(newPolicies);
                            }} 
                            className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-350 font-bold outline-none cursor-pointer"
                          >
                            <option value="Auto">Auto (Automotivo)</option>
                            <option value="Vida">Vida (Pessoas)</option>
                            <option value="Residencial">Residencial (Patrimônio)</option>
                            <option value="Saúde">Saúde (Médico/Hosp)</option>
                            <option value="Dental">Odontológico (Saúde)</option>
                            <option value="Viagem">Viagem (Turismo)</option>
                          </select>
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Valor do Prêmio Mensal</label>
                          <input 
                            type="number" 
                            value={p.premiumValue} 
                            onChange={e => {
                              const newPolicies = [...detailedPolicies];
                              newPolicies[idx].premiumValue = parseFloat(e.target.value) || 0;
                              setDetailedPolicies(newPolicies);
                            }} 
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-800 dark:text-slate-200 font-bold" 
                            placeholder="R$ 1500" 
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Objeto / Bem Segurado</label>
                        <input 
                          value={p.assetDescription} 
                          onChange={e => {
                            const newPolicies = [...detailedPolicies];
                            newPolicies[idx].assetDescription = e.target.value;
                            setDetailedPolicies(newPolicies);
                          }} 
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-800 dark:text-slate-200 font-bold" 
                          placeholder="Ex: Corolla XEI 2023 / Placa ABC-1234" 
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Limite de Indenização (LMG)</label>
                          <input 
                            value={p.coverageLimits} 
                            onChange={e => {
                              const newPolicies = [...detailedPolicies];
                              newPolicies[idx].coverageLimits = e.target.value;
                              setDetailedPolicies(newPolicies);
                            }} 
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-800 dark:text-slate-200 font-bold" 
                            placeholder="Ex: 100k terceiros / FIPE" 
                          />
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Data de Expiração</label>
                          <input 
                            type="date" 
                            value={p.expirationDate} 
                            onChange={e => {
                              const newPolicies = [...detailedPolicies];
                              newPolicies[idx].expirationDate = e.target.value;
                              setDetailedPolicies(newPolicies);
                            }} 
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-850 dark:text-slate-250 font-semibold cursor-pointer" 
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {detailedPolicies.length === 0 && (
                    <p className="text-xs text-[#8181A5] dark:text-slate-500 italic">Nenhum contrato formal de seguro cadastrado.</p>
                  )}
                </div>
              </section>

              {/* Histórico de Sinistros */}
              <section className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center justify-between border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                  <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Histórico de Sinistros</h2>
                  <button 
                    onClick={addClaim} 
                    className="text-xs font-bold text-[#F4BE5E] hover:text-[#F4BE5E]/80 transition-colors cursor-pointer"
                  >
                    Reportar Sinistro
                  </button>
                </div>

                <div className="space-y-5">
                  {claimsList.map((c, idx) => (
                    <div 
                      key={c.id} 
                      className="p-5 bg-[#F6F6F6] dark:bg-orange-500/[0.02] rounded-lg border border-[#ECECF2] dark:border-orange-900/20 space-y-4 relative group"
                    >
                      <button 
                        onClick={() => removeClaim(c.id)} 
                        className="absolute top-4 right-4 text-xs font-bold text-[#FF808B] hover:text-[#FF808B]/80 transition-colors cursor-pointer"
                        title="Remover Sinistro"
                      >
                        Excluir
                      </button>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider block">Descrição do Evento</label>
                        <input 
                          value={c.description} 
                          onChange={e => {
                            const newClaims = [...claimsList];
                            newClaims[idx].description = e.target.value;
                            setClaimsList(newClaims);
                          }} 
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs outline-none text-slate-800 dark:text-slate-200 font-bold" 
                          placeholder="Ex: Colisão traseira na rodovia" 
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Status de Processamento</label>
                        <div className="flex flex-wrap gap-1.5">
                          {claimStatuses.map(st => {
                            const isSelected = c.status === st.value;
                            let activeClass = 'bg-[#ECECF2] text-slate-700';
                            if (isSelected) {
                              if (st.value === 'aberto' || st.value === 'em_analise' || st.value === 'vistoria') {
                                activeClass = 'bg-[#F4BE5E] text-white shadow-sm';
                              } else if (st.value === 'aprovado' || st.value === 'pago') {
                                activeClass = 'bg-[#7CE7AC] text-white shadow-sm';
                              } else if (st.value === 'recusado') {
                                activeClass = 'bg-[#FF808B] text-white shadow-sm';
                              }
                            }

                            return (
                              <button
                                key={st.value}
                                type="button"
                                onClick={() => {
                                  const newClaims = [...claimsList];
                                  newClaims[idx].status = st.value;
                                  setClaimsList(newClaims);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all duration-200 cursor-pointer ${
                                  isSelected
                                    ? activeClass
                                    : 'bg-white dark:bg-slate-900 text-[#8181A5] border border-[#ECECF2] dark:border-slate-800 hover:bg-[#F6F6F6]'
                                }`}
                              >
                                {st.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {claimsList.length === 0 && (
                    <p className="text-xs text-[#8181A5] dark:text-slate-500 italic py-2">Nenhum sinistro em andamento ou registrado.</p>
                  )}
                </div>
              </section>

            </div>

          </div>
        )}

        {/* Tab 2: Chamados de Suporte */}
        {activeTab === 'chamados' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn">
            {/* Tickets de Suporte */}
            <section className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-lg shadow-sm border border-[#ECECF2] dark:border-slate-800 space-y-6 hover:shadow-md transition-shadow duration-300">
              <div className="border-b border-[#ECECF2] dark:border-slate-800 pb-3">
                <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Atendimentos e Chamados de Suporte</h2>
              </div>
              
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input 
                    value={newSubject} 
                    onChange={e => setNewSubject(e.target.value)} 
                    placeholder="Assunto do novo ticket..." 
                    className="flex-1 px-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm outline-none focus:border-[#5E81F4] text-slate-800 dark:text-slate-200 transition-all font-normal placeholder:text-[#8181A5]/50"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createTicket(); } }}
                  />
                  <button 
                    onClick={createTicket} 
                    disabled={!newSubject.trim()}
                    className="px-5 py-3 bg-[#5E81F4] hover:bg-[#5E81F4]/90 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shrink-0 shadow-sm cursor-pointer"
                  >
                    Abrir Chamado
                  </button>
                </div>
                
                <div className="space-y-4">
                  {tickets.map(t => (
                    <div 
                      key={t.id} 
                      className="p-5 bg-[#F6F6F6] dark:bg-slate-800/20 rounded-lg border border-[#ECECF2] dark:border-slate-800 space-y-3"
                    >
                      <div className="flex justify-between items-start gap-4">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-relaxed font-bold">{t.subject}</p>
                        
                        <div className="flex gap-1 shrink-0 select-none">
                          {['aberto', 'em_andamento', 'fechado'].map(st => {
                            const isSelected = t.status === st;
                            let activeClass = '';
                            if (isSelected) {
                              if (st === 'fechado') {
                                activeClass = 'bg-[#7CE7AC] text-white shadow-sm';
                              } else if (st === 'em_andamento') {
                                activeClass = 'bg-[#F4BE5E] text-white shadow-sm';
                              } else {
                                activeClass = 'bg-[#FF808B] text-white shadow-sm';
                              }
                            }

                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => updateTicketStatus(t.id!, st)}
                                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                  isSelected
                                    ? activeClass
                                    : 'bg-white dark:bg-slate-900 text-[#8181A5] border border-[#ECECF2] dark:border-slate-800 hover:bg-[#F6F6F6]'
                                }`}
                              >
                                {st === 'em_andamento' ? 'Fila' : st}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      
                      {t.resolution && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-3 rounded-lg border border-[#ECECF2] dark:border-slate-800 leading-relaxed font-bold">
                          <strong className="text-[#7CE7AC] block mb-0.5 uppercase tracking-wider text-[9px]">Resolução Oficial:</strong> 
                          {t.resolution}
                        </div>
                      )}
                      
                      <p className="text-[10px] text-[#8181A5] font-bold uppercase tracking-wider">
                        Criado: {new Date(t.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                  
                  {tickets.length === 0 && (
                    <p className="text-xs text-[#8181A5] dark:text-slate-500 italic text-center py-6">Sem chamados de suporte abertos.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Tab 3: Chat em Tempo Real */}
        {activeTab === 'chat' && renderLiveChatTab()}

      </div>
    </div>
  );
}
