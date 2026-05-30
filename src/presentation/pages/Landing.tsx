import { useState, useEffect } from 'react';
import { loginWithGoogle, loginDevAdmin, loginWithEmail, sendPasswordRecovery, loginAnonymously, linkAnonymousAccount } from '../../infrastructure/firebase';
import { FirebaseCustomerRepository } from '../../infrastructure/FirebaseCustomerRepository';
import { ChatWidget } from '../components/ChatWidget';
import { cn } from '../../utils/utils';
import { useTheme } from '../context/ThemeContext';
import { Shield, Zap, Users, BarChart3, ArrowRight, ChevronRight, Lock, Globe, Mail, Chrome, Key, CreditCard } from 'lucide-react';
import { trackAnalyticsEvent } from '../../utils/analytics';

const customerRepo = new FirebaseCustomerRepository();

export function Landing() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSuccessMessage, setLoginSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Plan/Subscription States
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'Bronze' | 'Gold' | 'Premium'>('Gold');
  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'details' | 'processing' | 'success'>('details');
  const [checkoutError, setCheckoutError] = useState('');
  const [processingStage, setProcessingStage] = useState(0);
  
  // Novos estados para o checkout interativo avançado
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'pix'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVC, setCardCVC] = useState('');
  const [pixTimeLeft, setPixTimeLeft] = useState(600); // 10 minutos em segundos
  const [pixCopied, setPixCopied] = useState(false);

  // Estados para vinculação de senha (Abordagem B)
  const [checkoutPassword, setCheckoutPassword] = useState('');
  const [showCheckoutPassword, setShowCheckoutPassword] = useState(false);
  const [isLinkingAccount, setIsLinkingAccount] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState(false);

  const { theme, setTheme } = useTheme();

  useEffect(() => {
    trackAnalyticsEvent('page_view');
    
    const handleOpenLogin = () => {
      setShowLoginModal(true);
      setLoginError('');
      setLoginSuccessMessage('');
    };
    
    window.addEventListener('openLoginModal', handleOpenLogin);
    return () => window.removeEventListener('openLoginModal', handleOpenLogin);
  }, []);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutName.trim() || !checkoutEmail.trim()) {
      setCheckoutError('Por favor, preencha o Nome e o E-mail corporativo.');
      return;
    }
    
    if (paymentMethod === 'card') {
      if (!cardNumber.trim() || !cardExpiry.trim() || !cardCVC.trim()) {
        setCheckoutError('Por favor, preencha todos os campos do cartão de crédito fictício.');
        return;
      }
    }

    setIsProcessingPayment(true);
    setCheckoutError('');
    setPaymentStep('processing');
    
    try {
      // 1. Simular delay com múltiplos estágios do Gateway de Pagamento e Firestore
      setProcessingStage(0); // "Validando credenciais corporativas..."
      await new Promise(resolve => setTimeout(resolve, 800));
      setProcessingStage(1); // "Aprovando transação no banco..."
      await new Promise(resolve => setTimeout(resolve, 800));
      setProcessingStage(2); // "Sincronizando perfil com o Firestore..."
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // 2. Autenticação anônima real no Firebase com fallback resiliente para simulação local
      let uid = '';
      try {
        const anonymousUser = await loginAnonymously();
        uid = anonymousUser.uid;
      } catch (authErr) {
        console.warn("Firebase Anonymous Auth failed, falling back to local simulation ID:", authErr);
        uid = 'mock_' + Math.random().toString(36).substring(2, 11);
      }
      
      // 3. Mapear o plano para o formato do Firestore
      const tierMap = {
        Bronze: 'Bronze',
        Gold: 'Ouro',
        Premium: 'Platina'
      };
      
      const policyMap = {
        Bronze: {
          name: 'Seguro Saúde Bronze Básico',
          id: '#SAUDE-BRONZE-102',
          desc: 'Cobertura regional ambulatorial'
        },
        Gold: {
          name: 'Seguro Auto Gold Completo',
          id: '#AUTO-GOLD-342',
          desc: 'Cobertura colisão e guincho 200km'
        },
        Premium: {
          name: 'Seguro Saúde Executivo Premium Plus',
          id: '#SAUDE-PREMIUM-778',
          desc: 'Cobertura nacional, internação particular e reembolso ilimitado'
        }
      };
      
      const selectedPolicy = policyMap[selectedPlan];
      
      // 4. Salvar perfil real do segurado no Firestore com fallback
      try {
        await customerRepo.saveCustomerProfile(uid, {
          userId: uid,
          name: checkoutName.trim(),
          email: checkoutEmail.trim(),
          phone: checkoutPhone.trim(),
          activePolicies: [`${selectedPolicy.name} (Apólice ${selectedPolicy.id})`],
          policies: [],
          claims: [],
          documents: [],
          loyaltyTier: tierMap[selectedPlan],
          lifeStage: 'Família',
          riskScore: selectedPlan === 'Premium' ? 10 : selectedPlan === 'Gold' ? 25 : 45,
          aiSummary: `Segurado ${selectedPlan} cadastrado com sucesso via portal de auto-adesão de planos (Simulação Resiliente).`,
          role: 'cliente'
        });
      } catch (dbErr) {
        console.warn("Firestore save failed, proceeding with local browser storage simulation:", dbErr);
      }
      
      // 5. Salvar localmente no LocalStorage para o ChatWidget ler instantaneamente
      localStorage.setItem('segurabot_visitor_id', uid);
      localStorage.setItem('segurabot_visitor_name', checkoutName.trim());
      localStorage.setItem('segurabot_visitor_email', checkoutEmail.trim());
      localStorage.setItem('segurabot_visitor_plan', selectedPlan);
      
      // 6. Disparar evento para o ChatWidget
      window.dispatchEvent(new CustomEvent('segurabot_plan_subscribed', { 
        detail: { uid, name: checkoutName.trim(), plan: selectedPlan } 
      }));
      
      setPaymentStep('success');
    } catch (err: any) {
      console.error("General simulation error:", err);
      // Fallback absoluto de emergência para garantir que a simulação de vendas nunca quebre o teste do usuário
      const fallbackUid = 'mock_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('segurabot_visitor_id', fallbackUid);
      localStorage.setItem('segurabot_visitor_name', checkoutName.trim());
      localStorage.setItem('segurabot_visitor_email', checkoutEmail.trim());
      localStorage.setItem('segurabot_visitor_plan', selectedPlan);
      window.dispatchEvent(new CustomEvent('segurabot_plan_subscribed', { 
        detail: { uid: fallbackUid, name: checkoutName.trim(), plan: selectedPlan } 
      }));
      setPaymentStep('success');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleLinkPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkoutPassword.length < 6) {
      setLinkError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    setIsLinkingAccount(true);
    setLinkError('');
    try {
      // Importa auth do firebase para verificar se há usuário logado real
      const { auth } = await import('../../infrastructure/firebase');
      const currentUser = auth.currentUser;
      
      if (currentUser && currentUser.isAnonymous) {
        await linkAnonymousAccount(checkoutEmail.trim(), checkoutPassword);
      } else {
        console.warn("Skipping real Firebase account linkage (no active anonymous user). Simulating local success.");
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      setLinkSuccess(true);
      localStorage.setItem('segurabot_visitor_has_password', 'true');
    } catch (err: any) {
      console.error("Account linkage error:", err);
      // Se for um usuário local/mock, ou se der erro de ambiente no Firebase, simulamos sucesso para não travar a experiência do usuário
      const { auth } = await import('../../infrastructure/firebase');
      if (!auth.currentUser) {
        console.warn("No Firebase Auth user active. Bypassing and simulating success.");
        await new Promise(resolve => setTimeout(resolve, 800));
        setLinkSuccess(true);
        localStorage.setItem('segurabot_visitor_has_password', 'true');
      } else {
        let errMsg = 'Falha ao vincular senha. Tente novamente ou prossiga sem senha.';
        if (err && err.code) {
          switch (err.code) {
            case 'auth/email-already-in-use':
              errMsg = 'Este e-mail já está associado a outra conta. Acesse pela Área do Cliente.';
              break;
            case 'auth/weak-password':
              errMsg = 'A senha informada é muito fraca.';
              break;
            default:
              if (err.message) errMsg = err.message;
          }
        }
        setLinkError(errMsg);
      }
    } finally {
      setIsLinkingAccount(false);
    }
  };

  // Timer para o Pix Regressivo
  useEffect(() => {
    if (!showCheckoutModal || paymentMethod !== 'pix' || paymentStep !== 'details') return;
    
    const interval = setInterval(() => {
      setPixTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showCheckoutModal, paymentMethod, paymentStep]);

  // Função auxiliar para formatar o timer do Pix (MM:SS)
  const formatPixTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLogin = () => {
    setShowLoginModal(true);
    setLoginError('');
    setLoginSuccessMessage('');
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      await loginWithEmail(loginEmail, loginPassword);
      trackAnalyticsEvent('conversion');
    } catch (error: any) {
      console.error("Email login failed", error);
      let message = "Falha ao autenticar. Por favor, verifique seus dados.";
      if (error && error.code) {
        switch (error.code) {
          case 'auth/invalid-email':
            message = "Formato de e-mail inválido.";
            break;
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            message = "E-mail ou senha incorretos.";
            break;
          case 'auth/too-many-requests':
            message = "Muitas tentativas malsucedidas. Tente novamente mais tarde.";
            break;
          default:
            if (error.message) {
              message = error.message;
            }
        }
      }
      setLoginError(message);
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError('');
    try {
      await loginWithGoogle();
      trackAnalyticsEvent('conversion');
    } catch (error: any) {
      console.error("Google login failed", error);
      if (error && error.code !== 'auth/popup-closed-by-user') {
        setLoginError("Falha na autenticação com Google.");
      }
      setIsLoggingIn(false);
    }
  };

  const handlePasswordRecovery = async () => {
    if (!loginEmail.trim()) {
      setLoginError("Por favor, digite seu e-mail corporativo no campo de e-mail.");
      setLoginSuccessMessage('');
      return;
    }
    
    setIsLoggingIn(true);
    setLoginError('');
    setLoginSuccessMessage('');
    
    try {
      await sendPasswordRecovery(loginEmail.trim());
      setLoginSuccessMessage("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
      setIsLoggingIn(false);
    } catch (error: any) {
      console.error("Password recovery failed", error);
      let message = "Falha ao enviar e-mail de recuperação. Tente novamente.";
      if (error && error.code === 'auth/user-not-found') {
        message = "E-mail corporativo não cadastrado no sistema.";
      } else if (error && error.code === 'auth/invalid-email') {
        message = "Formato de e-mail inválido.";
      }
      setLoginError(message);
      setIsLoggingIn(false);
    }
  };

  // Animated counter hook
  function useCounter(end: number, duration = 2000) {
    const [count, setCount] = useState(0);
    useEffect(() => {
      let start = 0;
      const increment = end / (duration / 16);
      const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
          setCount(end);
          clearInterval(timer);
        } else {
          setCount(Math.floor(start));
        }
      }, 16);
      return () => clearInterval(timer);
    }, [end, duration]);
    return count;
  }

  const statAtendimentos = useCounter(12480);
  const statReducao = useCounter(73);
  const statSatisfacao = useCounter(98);
  const statUptime = useCounter(99);

  return (
    <div className="min-h-screen bg-[#F6F6F6] dark:bg-slate-950 text-slate-900 dark:text-white font-sans relative overflow-x-hidden transition-colors duration-300">
      
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-30%] right-[-10%] w-[600px] h-[600px] bg-[#5E81F4]/5 dark:bg-[#5E81F4]/3 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#9698D6]/5 dark:bg-[#9698D6]/3 rounded-full blur-3xl"></div>
      </div>
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-[#ECECF2] dark:border-slate-800 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 py-3 md:px-6 md:py-4 flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-2 md:gap-2.5">
            <img 
              src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'} 
              alt="SeguraBot Logo" 
              className="w-9 h-9 md:w-12 md:h-12 object-contain" 
            />
            <span className="text-lg md:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Segura<span className="text-[#5E81F4]">Bot</span>
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#recursos" className="text-sm font-bold text-[#8181A5] hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider">Recursos</a>
            <a href="#solucoes" className="text-sm font-bold text-[#8181A5] hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider">Soluções</a>
            <a href="#metricas" className="text-sm font-bold text-[#8181A5] hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider">Resultados</a>
            <a href="#equipe" className="text-sm font-bold text-[#8181A5] hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider">Equipe</a>
            <a href="#contato" className="text-sm font-bold text-[#8181A5] hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-wider">Contato</a>
          </nav>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Theme Toggle */}
            <div className="flex items-center bg-white dark:bg-slate-900 p-1 rounded-lg border border-[#ECECF2] dark:border-slate-800 transition-colors">
              <button
                onClick={() => setTheme('light')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  theme === 'light' 
                    ? "bg-[#F6F6F6] dark:bg-slate-700 text-[#F4BE5E] shadow-sm" 
                    : "text-[#8181A5] hover:text-slate-600 dark:hover:text-slate-300"
                )}
                title="Modo Claro"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.65 17.65l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 17.65l1.41-1.41"/><path d="M17.65 4.93l1.41-1.41"/></svg>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  theme === 'dark' 
                    ? "bg-[#F6F6F6] dark:bg-slate-700 text-[#5E81F4] shadow-sm" 
                    : "text-[#8181A5] hover:text-slate-600 dark:hover:text-slate-300"
                )}
                title="Modo Escuro"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              </button>
            </div>

            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="px-3.5 py-2 md:px-5 md:py-2.5 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white text-xs md:text-sm font-bold rounded-lg transition-all disabled:opacity-70 shadow-sm shadow-[#5E81F4]/20 flex items-center gap-1.5 md:gap-2"
            >
              <span>{isLoggingIn ? 'Autenticando...' : 'Área do Cliente'}</span>
              {!isLoggingIn && <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-20 text-center">
        
        {/* Badge */}
        <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 rounded-full border border-[#ECECF2] dark:border-slate-800 mb-8 shadow-sm">
          <div className="w-2 h-2 rounded-full bg-[#7CE7AC] animate-pulse"></div>
          <span className="text-xs font-bold tracking-wider uppercase text-[#5E81F4]">Plataforma ativa — IA para Seguros</span>
        </div>
        
        <h1 className="animate-fade-in-up delay-100 text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter mb-6 leading-[0.95]">
          <span className="bg-clip-text text-transparent bg-gradient-to-b from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
            Atendimento inteligente.
          </span>
          <br />
          <span className="gradient-text">Sem complicação.</span>
        </h1>
        
        <p className="animate-fade-in-up delay-200 text-lg text-[#8181A5] max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          Automatize o suporte da sua seguradora com agentes baseados nas suas regras de negócio. 
          Reduza o tempo de espera e qualifique leads em tempo real.
        </p>

        <div className="animate-fade-in-up delay-300 flex justify-center items-center max-w-xs sm:max-w-none mx-auto">
          <button
            id="hero-cta-button"
            onClick={() => {
              const event = new CustomEvent('openChatWidget');
              window.dispatchEvent(event);
            }}
            className="w-full sm:w-auto px-7 py-3.5 bg-[#5E81F4] text-white font-bold rounded-lg hover:bg-[#5E81F4]/90 transition-all shadow-lg shadow-[#5E81F4]/20 flex items-center justify-center gap-2 text-sm"
          >
            <span>Chat Online</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </main>

      {/* Resultados Section */}
      <section id="metricas" className="relative z-10 max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest mb-3">Resultados</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Métricas de impacto real</h2>
          <p className="text-sm text-[#8181A5] max-w-xl mx-auto mt-2 leading-relaxed font-normal">
            Resultados consolidados que comprovam a eficiência da nossa tecnologia no atendimento diário.
          </p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover text-center">
            <p className="text-3xl font-black text-[#5E81F4] tabular-nums">{statAtendimentos.toLocaleString('pt-BR')}+</p>
            <p className="text-xs font-bold text-[#8181A5] uppercase tracking-wider mt-2">Atendimentos</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover text-center">
            <p className="text-3xl font-black text-[#7CE7AC] tabular-nums">{statReducao}%</p>
            <p className="text-xs font-bold text-[#8181A5] uppercase tracking-wider mt-2">Redução de Espera</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover text-center">
            <p className="text-3xl font-black text-[#9698D6] tabular-nums">{statSatisfacao}%</p>
            <p className="text-xs font-bold text-[#8181A5] uppercase tracking-wider mt-2">Satisfação</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover text-center">
            <p className="text-3xl font-black text-[#40E1FA] tabular-nums">{statUptime}.9%</p>
            <p className="text-xs font-bold text-[#8181A5] uppercase tracking-wider mt-2">Uptime</p>
          </div>
        </div>
      </section>

      {/* Recursos Section */}
      <section id="recursos" className="relative z-10 max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest mb-3">Recursos</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Tecnologia avançada para automação</h2>
          <p className="text-sm text-[#8181A5] max-w-xl mx-auto mt-2 leading-relaxed font-normal">
            Conheça os pilares que tornam o SeguraBot a solução de IA mais segura e robusta para o mercado de seguros.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-8 rounded-xl card-hover group">
            <div className="w-12 h-12 rounded-xl bg-[#5E81F4]/10 dark:bg-[#5E81F4]/5 flex items-center justify-center text-[#5E81F4] mb-5 group-hover:scale-110 transition-transform duration-300">
              <Shield className="w-6 h-6" />
            </div>
            <div className="text-[10px] font-bold text-[#5E81F4] mb-3 uppercase tracking-widest">01. RAG Ativado</div>
            <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">Consulta de Manuais</h3>
            <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
              Nosso sistema lê suas regras de negócio e manuais de seguros para responder com precisão cirúrgica.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-8 rounded-xl card-hover group">
            <div className="w-12 h-12 rounded-xl bg-[#9698D6]/10 dark:bg-[#9698D6]/5 flex items-center justify-center text-[#9698D6] mb-5 group-hover:scale-110 transition-transform duration-300">
              <Users className="w-6 h-6" />
            </div>
            <div className="text-[10px] font-bold text-[#9698D6] mb-3 uppercase tracking-widest">02. Integração CRM</div>
            <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">Dados do Cliente</h3>
            <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
              O atendente sabe exatamente quem está falando e o histórico de apólices, oferecendo suporte personalizado.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-8 rounded-xl card-hover group">
            <div className="w-12 h-12 rounded-xl bg-[#7CE7AC]/10 dark:bg-[#7CE7AC]/5 flex items-center justify-center text-[#7CE7AC] mb-5 group-hover:scale-110 transition-transform duration-300">
              <Zap className="w-6 h-6" />
            </div>
            <div className="text-[10px] font-bold text-[#7CE7AC] mb-3 uppercase tracking-widest">03. Multiagentes</div>
            <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">Roteamento Inteligente</h3>
            <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
              Um supervisor decide qual especialista deve atender o cliente, garantindo a melhor resposta possível.
            </p>
          </div>
        </div>
      </section>

      {/* Soluções Section */}
      <section id="solucoes" className="relative z-10 max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest mb-3">Soluções</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Feito para o mercado segurador</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-8 rounded-xl card-hover group">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#F4BE5E]/10 flex items-center justify-center text-[#F4BE5E] group-hover:scale-110 transition-transform duration-300">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Para Corretoras</h3>
            </div>
            <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
              Automatize o atendimento de novos leads, tire dúvidas sobre produtos e agilize o processo de cotação com um assistente disponível 24/7.
            </p>
            <div className="mt-6 pt-5 border-t border-[#ECECF2] dark:border-slate-800 flex flex-wrap gap-2">
              {['Lead scoring', 'Cotação auto', 'FAQ inteligente'].map(tag => (
                <span key={tag} className="px-3 py-1.5 bg-[#F6F6F6] dark:bg-slate-800 text-[10px] font-bold text-[#8181A5] uppercase tracking-wider rounded-lg border border-[#ECECF2] dark:border-slate-700">{tag}</span>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-8 rounded-xl card-hover group">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#40E1FA]/10 flex items-center justify-center text-[#40E1FA] group-hover:scale-110 transition-transform duration-300">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Para Seguradoras</h3>
            </div>
            <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
              Integre com seus sistemas legados para consulta de apólices, status de sinistros e suporte especializado para a rede de corretores.
            </p>
            <div className="mt-6 pt-5 border-t border-[#ECECF2] dark:border-slate-800 flex flex-wrap gap-2">
              {['API legado', 'Sinistros', 'Rede parceiros'].map(tag => (
                <span key={tag} className="px-3 py-1.5 bg-[#F6F6F6] dark:bg-slate-800 text-[10px] font-bold text-[#8181A5] uppercase tracking-wider rounded-lg border border-[#ECECF2] dark:border-slate-700">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing / Planos de Assinatura Section */}
      <section id="planos" className="relative z-10 max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest mb-3">Assinaturas</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Escolha seu plano de proteção</h2>
          <p className="text-sm text-[#8181A5] max-w-xl mx-auto mt-2 leading-relaxed font-normal">
            Adquira uma apólice imediata e ative o suporte prioritário por inteligência artificial em segundos.
          </p>
        </div>

        <div id="plans-section-tour" className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            {
              id: 'Bronze',
              title: 'Plano Bronze',
              price: 'R$ 49',
              desc: 'Proteção básica corporativa ideal para suporte e consultas cotidianas de apólices.',
              features: ['Acesso ao SeguraBot RAG', 'Cobertura de Saúde Regional', 'Tickets de Suporte Comuns', 'Carência Padrão']
            },
            {
              id: 'Gold',
              title: 'Plano Ouro (Gold)',
              price: 'R$ 99',
              desc: 'Proteção veicular completa com guincho 24h e inteligência artificial de alta performance.',
              features: ['IA Avançada e RAG', 'Seguro Auto Completo', 'Guincho e Assistência 24h', 'Loyalty Tier Ouro', 'Handoff para Humano'],
              popular: true
            },
            {
              id: 'Premium',
              title: 'Plano Platina (Premium)',
              price: 'R$ 199',
              desc: 'Máxima prioridade operacional com SLA executivo, reembolsos ágeis e cobertura nacional.',
              features: ['RAG com Manuais PDF Ilimitados', 'Seguro Saúde Executivo Premium', 'Suporte SLA de Alta Prioridade', 'Loyalty Tier Platina', 'Upgrades Automáticos']
            }
          ].map(plan => {
            const isBronze = plan.id === 'Bronze';
            const isGold = plan.id === 'Gold';
            const isPremium = plan.id === 'Premium';

            return (
              <div 
                key={plan.id} 
                className={cn(
                  "bg-white dark:bg-slate-900/60 backdrop-blur-md border rounded-2xl p-8 transition-all duration-500 flex flex-col justify-between text-left relative overflow-hidden group shadow-sm hover:shadow-2xl hover:-translate-y-1.5",
                  isBronze ? "border-amber-900/20 hover:border-amber-800/40 dark:hover:border-amber-700/40" :
                  isGold ? "border-amber-500/30 hover:border-amber-500/80 dark:hover:border-amber-500/50 scale-102 z-10" :
                  "border-slate-200 dark:border-slate-800 hover:border-slate-500/80 dark:hover:border-slate-500/40"
                )}
              >
                {/* Efeito de brilho de fundo interativo ao passar o mouse */}
                <div className={cn(
                  "absolute -right-20 -top-20 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-20 dark:group-hover:opacity-10 transition-opacity duration-700 pointer-events-none",
                  isBronze ? "bg-amber-800" :
                  isGold ? "bg-amber-500" :
                  "bg-blue-600"
                )} />

                {isGold && (
                  <span className="absolute top-3 right-4 px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm shadow-amber-500/10">
                    Mais Popular
                  </span>
                )}
                
                <div className="space-y-4 relative z-10">
                  <p className={cn(
                    "text-[10px] font-black uppercase tracking-widest",
                    isBronze ? "text-amber-800 dark:text-amber-500" :
                    isGold ? "text-amber-500" :
                    "text-blue-600 dark:text-blue-400"
                  )}>{plan.title}</p>
                  
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{plan.price}</span>
                    <span className="text-xs font-bold text-[#8181A5]">/mês</span>
                  </div>
                  <p className="text-xs text-[#8181A5] leading-relaxed font-normal">{plan.desc}</p>
                  
                  <div className="border-t border-[#ECECF2] dark:border-slate-800 my-4 pt-4 space-y-2.5">
                    {plan.features.map(feat => (
                      <div key={feat} className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          isBronze ? "bg-amber-800 dark:bg-amber-600" :
                          isGold ? "bg-amber-500" :
                          "bg-blue-600 dark:bg-blue-400"
                        )}></div>
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedPlan(plan.id as any);
                    setPaymentStep('details');
                    setCheckoutError('');
                    setShowCheckoutModal(true);
                  }}
                  className={cn(
                    "w-full py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all mt-6 text-center shadow-sm duration-300 group-hover:scale-[1.02]",
                    isGold
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-amber-500/20 hover:brightness-105"
                      : "bg-[#F6F6F6] dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 border border-[#ECECF2] dark:border-slate-700"
                  )}
                >
                  Contratar Agora
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Security / Trust Section */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="bg-gradient-to-br from-[#5E81F4]/5 to-[#9698D6]/5 dark:from-[#5E81F4]/5 dark:to-[#9698D6]/3 p-10 rounded-xl border border-[#5E81F4]/20 dark:border-[#5E81F4]/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#5E81F4]/10 flex items-center justify-center text-[#5E81F4]">
                  <Lock className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest">Segurança</p>
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">Arquitetura de confiança zero</h3>
              <p className="text-sm text-[#8181A5] leading-relaxed font-normal">
                Todos os dados são processados com criptografia end-to-end. Autenticação Firebase com suporte a SSO, MFA e controle granular de permissões por roles (Admin, Atendente, Cliente).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Criptografia', value: 'AES-256' },
                { label: 'Auth Provider', value: 'Firebase' },
                { label: 'LGPD', value: 'Compliant' },
                { label: 'Roles', value: '3 Níveis' },
              ].map(item => (
                <div key={item.label} className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-[#ECECF2] dark:border-slate-800 text-center">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{item.value}</p>
                  <p className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Developers Spotlight Section */}
      <section id="equipe" className="relative z-10 max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest mb-3">Engenharia</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Desenvolvedores do Projeto</h2>
          <p className="text-sm text-[#8181A5] max-w-xl mx-auto mt-2 leading-relaxed font-normal">
            Os engenheiros por trás da inteligência de negócios, RAG e arquitetura de multiagentes do SeguraBot.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {[
            { 
              initials: 'JP', 
              name: 'João Paulo da Silva Cardoso', 
              role: 'Fullstack & AI Architecture', 
              image: '/images/joao.jpg',
              description: 'Especialista em orquestração de grafos multiagentes com LangGraph, subscrições Firebase reativas em tempo real e segurança de dados.' 
            },
            { 
              initials: 'LA', 
              name: 'Leonardo Alves Pereira', 
              role: 'AI Service & Systems Integration', 
              image: '/images/leonardo.png',
              description: 'Especialista em integrações generativas avançadas com Gemini, processamento inteligente de OCR e comunicação com sistemas de seguros legados.' 
            },
          ].map(dev => (
            <div key={dev.initials} className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-white dark:bg-slate-900 rounded-2xl border border-[#ECECF2] dark:border-slate-800 card-hover group relative overflow-hidden">
              {/* Profile Image with subtle scale-on-hover */}
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shrink-0 border border-[#ECECF2] dark:border-slate-800 shadow-sm bg-[#5E81F4]/5 flex items-center justify-center">
                {dev.image ? (
                  <img 
                    src={dev.image} 
                    alt={dev.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div 
                  className="absolute inset-0 bg-[#5E81F4]/10 dark:bg-[#5E81F4]/5 flex items-center justify-center text-[#5E81F4] font-bold text-xl"
                  style={{ display: dev.image ? 'none' : 'flex' }}
                >
                  {dev.initials}
                </div>
              </div>

              {/* Developer Details */}
              <div className="flex-1 text-center sm:text-left space-y-2">
                <span className="inline-block px-2.5 py-1 bg-[#5E81F4]/10 dark:bg-[#5E81F4]/5 text-[#5E81F4] text-[10px] font-bold uppercase tracking-wider rounded-md">
                  {dev.role}
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                  {dev.name}
                </h3>
                <p className="text-xs text-[#8181A5] leading-relaxed font-normal">
                  {dev.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact Section */}
      <section id="contato" className="relative z-10 max-w-6xl mx-auto px-6 pb-24 scroll-mt-20">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-[#5E81F4] uppercase tracking-widest mb-3">Contato</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Fale Conosco</h2>
          <p className="text-sm text-[#8181A5] max-w-xl mx-auto mt-2 leading-relaxed font-normal">
            Dúvidas, sugestões ou suporte técnico? Nossa equipe está de prontidão para ajudar.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <a 
            href="mailto:contato@segurabot.com.br" 
            className="flex items-center justify-between p-6 bg-white dark:bg-slate-900 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover hover:border-[#5E81F4]/40 dark:hover:border-[#5E81F4]/40 transition-all group"
          >
            <div className="text-left space-y-1.5">
              <p className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Email Comercial</p>
              <p className="text-base font-bold text-[#5E81F4] break-all">contato@segurabot.com.br</p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#8181A5] group-hover:text-[#5E81F4] group-hover:translate-x-1 transition-all shrink-0" />
          </a>
          
          <a 
            href="https://github.com/jpscard/uci_ai/tree/main" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex items-center justify-between p-6 bg-white dark:bg-slate-900 rounded-xl border border-[#ECECF2] dark:border-slate-800 card-hover hover:border-[#5E81F4]/40 dark:hover:border-[#5E81F4]/40 transition-all group"
          >
            <div className="text-left space-y-1.5">
              <p className="text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">Código Fonte</p>
              <p className="text-base font-bold text-[#5E81F4]">Repositório GitHub</p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#8181A5] group-hover:text-[#5E81F4] group-hover:translate-x-1 transition-all shrink-0" />
          </a>
        </div>
      </section>

      {/* CTA Final Section */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-24">
        <div className="bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 p-10 md:p-14 rounded-2xl text-center relative overflow-hidden animate-glow-pulse shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-[#5E81F4]/5 to-[#9698D6]/5 dark:from-[#5E81F4]/10 dark:to-[#9698D6]/10 pointer-events-none"></div>
          <div className="relative z-10">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">Pronto para transformar seu atendimento?</h2>
            <p className="text-sm text-[#8181A5] dark:text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed font-normal">
              Entre em contato conosco para desenharmos uma solução personalizada para o tamanho e as necessidades da sua operação.
            </p>
            <button 
              onClick={handleLogin}
              className="px-8 py-3.5 bg-[#5E81F4] text-white font-bold rounded-lg hover:bg-[#5E81F4]/90 transition-all shadow-lg shadow-[#5E81F4]/30 text-sm flex items-center gap-2 mx-auto cursor-pointer"
            >
              <span>Começar Agora</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#ECECF2] dark:border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-bold text-[#8181A5]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#5E81F4] rounded-lg flex items-center justify-center text-white font-bold text-[9px]">S</div>
            <span>© 2026 SeguraBot. Todos os direitos reservados.</span>
          </div>
          <div className="flex gap-6 uppercase tracking-wider text-[10px]">
            <span className="hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer transition-colors">Termos de Uso</span>
            <span className="hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer transition-colors">Privacidade</span>
            <span className="hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer transition-colors">LGPD</span>
          </div>
        </div>
      </footer>

      {/* Chat Widget */}
      <ChatWidget />

      {/* Unified Premium Login Modal */}
      {showLoginModal && (
        <div 
          id="login-modal" 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
        >
          {/* Backdrop Blur */}
          <div 
            id="login-modal-backdrop"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity" 
            onClick={() => {
              if (!isLoggingIn) setShowLoginModal(false);
            }}
          />
          
          {/* Modal Container */}
          <div 
            id="login-modal-container"
            className="relative bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl w-full max-w-md p-8 shadow-2xl transition-all animate-scale-in"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Portal de Acesso
              </h3>
              <button 
                id="login-close"
                type="button"
                disabled={isLoggingIn}
                onClick={() => setShowLoginModal(false)}
                className="text-xs font-bold text-[#8181A5] hover:text-slate-900 dark:hover:text-white uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            {/* Error Message */}
            {loginError && (
              <div 
                id="login-error-message"
                className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold rounded-lg text-center"
              >
                {loginError}
              </div>
            )}

            {/* Success Message */}
            {loginSuccessMessage && (
              <div 
                id="login-success-message"
                className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg text-center"
              >
                {loginSuccessMessage}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#8181A5] uppercase tracking-wider mb-1.5">
                  E-mail Corporativo
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-650 pointer-events-none" />
                  <input 
                    id="login-email"
                    type="email"
                    required
                    disabled={isLoggingIn}
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="nome@empresa.com.br"
                    className="w-full pl-10 pr-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#5E81F4] transition-colors disabled:opacity-60 font-semibold"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">
                    Senha
                  </label>
                  <button
                    id="login-toggle-password"
                    type="button"
                    disabled={isLoggingIn}
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[10px] font-bold text-[#5E81F4] uppercase tracking-wider hover:underline disabled:opacity-50"
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-650 pointer-events-none" />
                  <input 
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={isLoggingIn}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Sua senha corporativa"
                    className="w-full pl-10 pr-4 py-3 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#5E81F4] transition-colors disabled:opacity-60 font-semibold"
                  />
                </div>
                <div className="flex justify-end mt-1.5">
                  <button
                    id="login-forgot-password"
                    type="button"
                    disabled={isLoggingIn}
                    onClick={handlePasswordRecovery}
                    className="text-[10px] font-bold text-[#8181A5] hover:text-[#5E81F4] uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </div>

              <button 
                id="login-submit"
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-70 shadow-sm shadow-[#5E81F4]/20 flex items-center justify-center cursor-pointer"
              >
                {isLoggingIn ? 'Verificando...' : 'Entrar'}
              </button>
            </form>

            {/* Separator */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#ECECF2] dark:border-slate-800"></div>
              </div>
              <span className="relative bg-white dark:bg-slate-900 px-3 text-[10px] font-bold text-[#8181A5] uppercase tracking-wider">
                Ou continue com
              </span>
            </div>

            {/* Google SSO Button */}
            <button 
              id="login-google"
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="w-full py-3 bg-white dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 hover:bg-[#F6F6F6] dark:hover:bg-slate-900 text-slate-800 dark:text-white text-sm font-bold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Chrome className="w-4 h-4 text-[#5E81F4] dark:text-blue-400 shrink-0" />
              <span>Entrar com Conta Google</span>
            </button>

            {/* Developer Helper Panel (Only in DEV) */}
            {import.meta.env.DEV && (
              <div 
                id="login-dev-panel" 
                className="mt-6 pt-6 border-t border-[#ECECF2] dark:border-slate-800"
              >
                <p className="text-[10px] font-bold text-[#8181A5] uppercase tracking-widest text-center mb-2">
                  Acesso Rápido de Testes (DEV)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    id="login-dev-fill"
                    type="button"
                    disabled={isLoggingIn}
                    onClick={() => {
                      setLoginEmail('admin@segurabot.com.br');
                      setLoginPassword('password123');
                      setLoginError('');
                      setLoginSuccessMessage('');
                    }}
                    className="w-full py-2 bg-[#F6F6F6] hover:bg-[#ECECF2] dark:bg-slate-950 dark:hover:bg-slate-900 border border-dashed border-[#ECECF2] dark:border-slate-800 text-[10px] font-bold text-[#5E81F4] uppercase tracking-wider rounded-lg transition-colors cursor-pointer disabled:opacity-50 text-center"
                  >
                    Administrador
                  </button>
                  <button 
                    id="login-dev-fill-atendente"
                    type="button"
                    disabled={isLoggingIn}
                    onClick={() => {
                      setLoginEmail('atendente@segurabot.com.br');
                      setLoginPassword('password123');
                      setLoginError('');
                      setLoginSuccessMessage('');
                    }}
                    className="w-full py-2 bg-[#F6F6F6] hover:bg-[#ECECF2] dark:bg-slate-950 dark:hover:bg-slate-900 border border-dashed border-[#ECECF2] dark:border-slate-800 text-[10px] font-bold text-[#7CE7AC] uppercase tracking-wider rounded-lg transition-colors cursor-pointer disabled:opacity-50 text-center"
                  >
                    Atendente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout Modal Simulado */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in select-none">
          <div 
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
            onClick={() => { if (!isProcessingPayment) setShowCheckoutModal(false); }}
          />

          <div id="checkout-section-tour" className="relative bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl z-10 text-left animate-scale-in flex flex-col md:flex-row min-h-[550px]">
            
            {/* Coluna da Esquerda: Resumo Visual do Plano (Order Summary) */}
            <div className={cn(
              "md:w-[38%] p-8 text-white flex flex-col justify-between relative transition-all duration-500",
              selectedPlan === 'Premium' ? "bg-gradient-to-br from-[#0c0f1d] via-[#111827] to-[#1e1b4b] border-r border-white/5" :
              selectedPlan === 'Gold' ? "bg-gradient-to-br from-[#1e1704] via-[#111827] to-[#2e2307] border-r border-white/5" :
              "bg-gradient-to-br from-[#24170e] via-[#111827] to-[#362112] border-r border-white/5"
            )}>
              {/* Brilho decorativo no topo */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              
              <div className="space-y-6 relative z-10">
                <div>
                  <span className="px-2.5 py-1 bg-white/10 text-white border border-white/15 text-[8px] font-black uppercase tracking-widest rounded">
                    Resumo do Pedido
                  </span>
                  <h4 className="text-2xl font-black mt-4 tracking-tight">
                    {selectedPlan === 'Premium' ? 'Plano Platina' : selectedPlan === 'Gold' ? 'Plano Ouro' : 'Plano Bronze'}
                  </h4>
                  <p className="text-xs text-slate-350/85 font-normal leading-relaxed mt-2">
                    {selectedPlan === 'Premium' ? 'Prioridade máxima operacional com suporte prioritário contínuo e tempo de resposta zero.' :
                     selectedPlan === 'Gold' ? 'Proteção veicular completa com guincho 24h e suporte automatizado inteligente.' :
                     'Proteção básica perfeita para consultas rotineiras e orientações imediatas.'}
                  </p>
                </div>

                {/* Linha Fina Separadora */}
                <div className="space-y-3 pt-4 border-t border-white/10">
                  <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
                    <span>Ativação Imediata</span>
                    <span className="text-[#7CE7AC]">Instantâneo</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
                    <span>Adesão & Setup</span>
                    <span>Grátis</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
                    <span>Categoria</span>
                    <span className={cn(
                      "font-black uppercase tracking-wider text-[8px] px-2 py-0.5 rounded",
                      selectedPlan === 'Premium' ? "bg-white/10 text-slate-200 border border-white/15" :
                      selectedPlan === 'Gold' ? "bg-amber-500/20 text-amber-300 border border-amber-500/20" :
                      "bg-orange-500/20 text-orange-300 border border-orange-500/20"
                    )}>
                      {selectedPlan === 'Premium' ? 'Platina' : selectedPlan === 'Gold' ? 'Ouro' : 'Bronze'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-white/10 mt-8 space-y-4 relative z-10">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-350 font-bold uppercase tracking-wider">Investimento</span>
                  <div className="flex items-baseline">
                    <span className="text-3.5xl font-black tracking-tight">
                      {selectedPlan === 'Premium' ? 'R$ 199' : selectedPlan === 'Gold' ? 'R$ 99' : 'R$ 49'}
                    </span>
                    <span className="text-[10px] text-slate-300 font-bold">/mês</span>
                  </div>
                </div>
                <p className="text-[8px] text-slate-400 font-black tracking-widest text-center uppercase border border-white/5 py-2 rounded bg-black/20">
                  Ambiente Altamente Seguro
                </p>
              </div>
            </div>

            {/* Coluna da Direita: Secure Checkout Form */}
            <div className="flex-1 p-8 flex flex-col justify-between bg-white dark:bg-slate-900 relative">
              
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-xs font-black text-slate-900 dark:text-white tracking-widest uppercase">
                  Simulação de Checkout
                </h4>
                <button 
                  disabled={isProcessingPayment}
                  onClick={() => setShowCheckoutModal(false)}
                  className="text-[10px] font-black text-[#8181A5] hover:text-slate-900 dark:hover:text-white uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              {checkoutError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold rounded-lg text-center">
                  {checkoutError}
                </div>
              )}

              {paymentStep === 'details' && (
                <form onSubmit={handleCheckoutSubmit} className="space-y-6 flex-1 flex flex-col justify-between">
                  
                  <div className="space-y-5">
                    {/* Informações de Identificação */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-black text-[#8181A5] uppercase tracking-wider mb-1">
                          Nome Completo
                        </label>
                        <input 
                          type="text"
                          required
                          value={checkoutName}
                          onChange={(e) => setCheckoutName(e.target.value)}
                          placeholder="Nome Sobrenome"
                          className="w-full px-3.5 py-2.5 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#5E81F4] transition-colors font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-[#8181A5] uppercase tracking-wider mb-1">
                          E-mail Corporativo
                        </label>
                        <input 
                          type="email"
                          required
                          value={checkoutEmail}
                          onChange={(e) => setCheckoutEmail(e.target.value)}
                          placeholder="seuemail@empresa.com"
                          className="w-full px-3.5 py-2.5 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#5E81F4] transition-colors font-semibold"
                        />
                      </div>
                    </div>

                    {/* Abas de Método de Pagamento (Pills Dinâmicos) */}
                    <div>
                      <span className="text-[8px] font-black text-[#8181A5] uppercase tracking-widest block mb-2">Método de Pagamento Simulado</span>
                      <div className="flex gap-2 bg-[#F6F6F6] dark:bg-slate-950 p-1 rounded-xl border border-[#ECECF2] dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('card')}
                          className={cn(
                            "flex-1 py-2.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all text-center",
                            paymentMethod === 'card' 
                              ? "bg-white dark:bg-slate-850 text-[#5E81F4] shadow-sm"
                              : "text-[#8181A5] hover:text-slate-900 dark:hover:text-white"
                          )}
                        >
                          Cartão de Crédito
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('pix')}
                          className={cn(
                            "flex-1 py-2.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all text-center",
                            paymentMethod === 'pix' 
                              ? "bg-white dark:bg-slate-850 text-[#7CE7AC] shadow-sm"
                              : "text-[#8181A5] hover:text-slate-900 dark:hover:text-white"
                          )}
                        >
                          Pix Instantâneo
                        </button>
                      </div>
                    </div>

                    {/* Conteúdo Dinâmico com base no Método de Pagamento */}
                    {paymentMethod === 'card' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center pt-2">
                        {/* Cartão de Crédito Glassmorphic Interativo */}
                        <div className={cn(
                          "relative rounded-xl p-5 aspect-[1.58/1] overflow-hidden text-white flex flex-col justify-between shadow-lg border border-white/10 transition-all duration-700",
                          selectedPlan === 'Premium' ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 shadow-slate-950/40" :
                          selectedPlan === 'Gold' ? "bg-gradient-to-br from-amber-500 via-yellow-600 to-amber-700 shadow-amber-700/20" :
                          "bg-gradient-to-br from-amber-800 to-amber-950 shadow-amber-900/20"
                        )}>
                          {/* Reflexo */}
                          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[7px] font-black uppercase tracking-widest text-slate-300">
                                {selectedPlan === 'Premium' ? 'Platina Card' : selectedPlan === 'Gold' ? 'Ouro Card' : 'Bronze Card'}
                              </p>
                              <div className="w-8 h-6 bg-yellow-400/20 rounded-md border border-yellow-400/30 mt-1 flex items-center justify-center">
                                <div className="w-6 h-4 border border-yellow-400/20 rounded-sm bg-yellow-400/10" />
                              </div>
                            </div>
                            <span className="text-[10px] font-black tracking-widest text-slate-200">SEGURO</span>
                          </div>
                          
                          <div className="space-y-3">
                            <p className="text-sm font-bold tracking-widest text-center tabular-nums">
                              {cardNumber.padEnd(16, '•').replace(/(.{4})/g, '$1 ').trim()}
                            </p>
                            <div className="flex justify-between items-center text-[8px] font-semibold text-slate-350 tracking-wider">
                              <span className="uppercase truncate max-w-[120px]">{checkoutName || 'PORTADOR DO CARTÃO'}</span>
                              <span className="tabular-nums">{cardExpiry || 'MM/AA'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Inputs do Cartão de Crédito */}
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[8px] font-black text-[#8181A5] uppercase tracking-wider mb-1">
                              Número do Cartão
                            </label>
                            <input 
                              type="text"
                              maxLength={16}
                              placeholder="4000 1234 5678 9010"
                              value={cardNumber}
                              onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ''))}
                              className="w-full px-3 py-2 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#5E81F4] transition-all font-semibold"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[8px] font-black text-[#8181A5] uppercase tracking-wider mb-1">
                                Validade
                              </label>
                              <input 
                                type="text"
                                maxLength={5}
                                placeholder="12/30"
                                value={cardExpiry}
                                onChange={(e) => {
                                  let val = e.target.value.replace(/\D/g, '');
                                  if (val.length > 2) val = val.substring(0, 2) + '/' + val.substring(2, 4);
                                  setCardExpiry(val);
                                }}
                                className="w-full px-3 py-2 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#5E81F4] transition-all font-semibold text-center"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-black text-[#8181A5] uppercase tracking-wider mb-1">
                                CVC
                              </label>
                              <input 
                                type="password"
                                maxLength={3}
                                placeholder="123"
                                value={cardCVC}
                                onChange={(e) => setCardCVC(e.target.value.replace(/\D/g, ''))}
                                className="w-full px-3 py-2 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#5E81F4] transition-all font-semibold text-center"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Pix QR Code Simulado Premium */
                      <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl animate-fade-in">
                        <div className="p-3 bg-white rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0">
                          {/* QR Code Simulado Limpo */}
                          <div className="w-24 h-24 bg-slate-100 dark:bg-slate-900 rounded border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-center">
                            <span className="text-[8px] font-black uppercase text-slate-500">QR CODE</span>
                            <span className="text-[6px] font-bold text-[#7CE7AC] tracking-wider uppercase mt-1">PIX SEGURO</span>
                          </div>
                        </div>
                        <div className="flex-1 space-y-3 text-center sm:text-left">
                          <div>
                            <span className="inline-block px-2.5 py-0.5 bg-[#7CE7AC]/10 text-[#7CE7AC] border border-[#7CE7AC]/20 text-[7px] font-black uppercase tracking-widest rounded mb-1">
                              Aguardando Pix
                            </span>
                            <h5 className="text-xs font-bold text-slate-900 dark:text-white">Escaneie o código acima para pagar</h5>
                            <p className="text-[10px] text-[#8181A5] leading-relaxed mt-0.5">
                              Esta é uma simulação de pagamento rápido. O código expira em <strong className="text-rose-500 tabular-nums">{formatPixTime(pixTimeLeft)}</strong>.
                            </p>
                          </div>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => {
                                setPixCopied(true);
                                navigator.clipboard.writeText("segurabot-pix-simulado-gateway-key-3026");
                                setTimeout(() => setPixCopied(false), 2000);
                              }}
                              className="px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850 border border-[#ECECF2] dark:border-slate-800 text-[8px] font-black rounded-lg uppercase tracking-wider transition-colors cursor-pointer text-slate-800 dark:text-slate-200 flex items-center gap-1.5 justify-center sm:justify-start"
                            >
                              <span>Copiar Código Copia e Cola</span>
                            </button>
                            {pixCopied && (
                              <span className="absolute left-1/2 sm:left-4 -top-8 -translate-x-1/2 sm:translate-x-0 px-2 py-1 bg-[#7CE7AC] text-slate-950 text-[7px] font-black uppercase tracking-widest rounded shadow animate-fade-in">
                                Copiado!
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-3.5 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white text-[9px] font-black rounded-xl transition-all shadow-sm shadow-[#5E81F4]/20 flex items-center justify-center uppercase tracking-widest cursor-pointer mt-4"
                  >
                    Confirmar e Finalizar Assinatura
                  </button>
                </form>
              )}

              {paymentStep === 'processing' && (
                <div className="py-16 flex flex-col items-center justify-center space-y-4 flex-1">
                  <div className="w-10 h-10 border-4 border-[#5E81F4] border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-center space-y-1.5">
                    <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest animate-pulse">
                      {processingStage === 0 ? 'Conectando ao Gateway Seguro...' :
                       processingStage === 1 ? 'Processando transação com segurança...' :
                       'Aprovado! Configurando inteligência artificial do segurado...'}
                    </p>
                    <p className="text-[9px] font-bold text-[#8181A5] uppercase tracking-wider">Gateway de Pagamento Integrado</p>
                  </div>
                </div>
              )}

              {paymentStep === 'success' && (
                <div className="py-4 flex flex-col justify-between flex-1">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 bg-[#7CE7AC]/10 border border-[#7CE7AC]/20 rounded-full flex items-center justify-center text-[#7CE7AC] shadow-sm animate-bounce mx-auto">
                      <span className="text-lg font-black font-sans">✓</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-slate-900 dark:text-white tracking-tight uppercase">Assinatura Ativada!</h4>
                      <p className="text-[11px] text-[#8181A5] max-w-xs leading-relaxed font-normal mx-auto">
                        Parabéns, <strong className="text-slate-900 dark:text-white font-bold">{checkoutName}</strong>! Sua assinatura do <strong className="text-[#5E81F4] font-bold">{selectedPlan === 'Premium' ? 'Plano Platina' : selectedPlan === 'Gold' ? 'Plano Ouro' : 'Plano Bronze'}</strong> foi ativada com absoluto sucesso.
                      </p>
                    </div>
                  </div>

                  {linkSuccess ? (
                    <div className="my-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3 text-center animate-fade-in">
                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                        Senha Cadastrada com Sucesso!
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal max-w-xs mx-auto">
                        Sua conta foi vinculada ao e-mail <strong className="text-slate-900 dark:text-white font-semibold">{checkoutEmail}</strong>. Utilize sua senha criada para acessar a Área do Cliente de qualquer lugar.
                      </p>
                      <button
                        onClick={() => {
                          setShowCheckoutModal(false);
                          const event = new CustomEvent('openChatWidget');
                          window.dispatchEvent(event);
                        }}
                        className="w-full py-3 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white text-[9px] font-black rounded-xl uppercase tracking-widest cursor-pointer shadow-sm transition-all"
                      >
                        Iniciar Suporte
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleLinkPassword} className="my-4 p-4 bg-[#F6F6F6] dark:bg-slate-950 border border-[#ECECF2] dark:border-slate-800 rounded-xl space-y-3.5 animate-fade-in">
                      <div>
                        <h5 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-wider">Crie sua Senha de Acesso</h5>
                        <p className="text-[9px] text-[#8181A5] leading-normal mt-0.5">
                          Para se autenticar futuramente e não perder seu histórico de atendimento, defina uma senha de acesso seguro para <strong className="text-slate-800 dark:text-slate-300 font-semibold">{checkoutEmail}</strong>.
                        </p>
                      </div>

                      {linkError && (
                        <div className="p-2 bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-bold rounded-lg text-center">
                          {linkError}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[8px] font-black text-[#8181A5] uppercase tracking-wider">Nova Senha</label>
                          <button
                            type="button"
                            onClick={() => setShowCheckoutPassword(!showCheckoutPassword)}
                            className="text-[8px] font-black text-[#5E81F4] uppercase tracking-wider hover:underline"
                          >
                            {showCheckoutPassword ? 'Ocultar' : 'Mostrar'}
                          </button>
                        </div>
                        <input
                          type={showCheckoutPassword ? 'text' : 'password'}
                          required
                          value={checkoutPassword}
                          onChange={(e) => setCheckoutPassword(e.target.value)}
                          placeholder="Mínimo de 6 caracteres"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-[#ECECF2] dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#5E81F4] transition-colors font-semibold"
                        />
                      </div>

                      <div className="space-y-2 pt-1">
                        <button
                          type="submit"
                          disabled={isLinkingAccount}
                          className="w-full py-2.5 bg-[#5E81F4] hover:bg-[#5E81F4]/90 text-white text-[8px] font-black rounded-lg uppercase tracking-widest transition-all shadow-sm flex items-center justify-center cursor-pointer"
                        >
                          {isLinkingAccount ? 'Processando...' : 'Vincular Senha & Acessar'}
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            setShowCheckoutModal(false);
                            const event = new CustomEvent('openChatWidget');
                            window.dispatchEvent(event);
                          }}
                          className="w-full text-center text-[8px] font-black text-[#8181A5] hover:text-slate-900 dark:hover:text-white uppercase tracking-widest py-1 transition-colors cursor-pointer block"
                        >
                          Prosseguir Sem Senha por enquanto
                        </button>
                      </div>
                    </form>
                  )}
                  
                  <p className="text-[7px] font-bold text-slate-400 dark:text-slate-650 uppercase tracking-widest text-center">
                    SeguraBot Automação Inteligente
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
