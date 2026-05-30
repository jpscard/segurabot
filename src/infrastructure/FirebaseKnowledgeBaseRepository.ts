import { collection, getDocs, query } from 'firebase/firestore';
import { db, isFirebaseRestricted, setFirebaseRestricted } from './firebase';
import { KnowledgeBaseEntry } from '../domain';
import { IKnowledgeBaseRepository } from '../domain/IKnowledgeBaseRepository';
import { DynamicEmbeddingService } from './DynamicEmbeddingService';

const LOCAL_FAQ = [
  {
    "category": "Carência",
    "question": "Qual o prazo de carência para consultas e exames simples?",
    "answer": "O prazo de carência para consultas médicas de rotina e exames laboratoriais simples é de apenas 24 horas a partir da data de ativação do seu plano de saúde.",
    "source": "Manual de Carências SeguraBot Saúde"
  },
  {
    "category": "Reembolso",
    "question": "Como funciona a solicitação de reembolso para médicos fora da rede?",
    "answer": "Você pode solicitar o reembolso de consultas particulares anexando o recibo médico assinado ou nota fiscal digital diretamente no painel do cliente. O prazo de depósito é de até 30 dias úteis e o reembolso é calculado com base no limite padrão da tabela do seu plano Executivo.",
    "source": "Manual de Reembolsos SeguraBot Saúde"
  },
  {
    "category": "Coparticipação",
    "question": "Qual o percentual de coparticipação em exames de alta complexidade?",
    "answer": "Para exames de alta complexidade, como ressonâncias magnéticas e tomografias computadorizadas, a taxa de coparticipação é de 20%, com um valor máximo limitado ao teto de R$ 120,00 por procedimento, protegendo você contra custos excessivos.",
    "source": "Tabela de Coparticipação SeguraBot Saúde"
  },
  {
    "category": "Cobertura",
    "question": "O plano de saúde cobre atendimento de urgência nacional?",
    "answer": "Sim, o plano Executivo Saúde oferece Cobertura Nacional completa para situações de urgência e emergência médicas em qualquer hospital ou pronto-socorro da nossa rede credenciada espalhada por todo o território nacional.",
    "source": "Termos de Cobertura Geográfica"
  },
  {
    "category": "Dependentes",
    "question": "Como faço para incluir um recém-nascido como dependente sem carência?",
    "answer": "A inclusão de recém-nascidos deve ser realizada em até 30 dias corridos após o nascimento. Fazendo a solicitação dentro deste prazo regulamentar, o bebê é integrado ao plano imediatamente com isenção total de prazos de carência.",
    "source": "Regulamento de Inclusão de Dependentes"
  },
  {
    "category": "Internação",
    "question": "O plano cobrirá internação em quarto particular ou enfermaria?",
    "answer": "Seu plano Executivo de saúde garante cobertura integral para internações em quarto particular (apartamento) com direito a um acompanhante durante todo o período de hospitalização sem custos adicionais de diárias.",
    "source": "Manual de Hospitalização SeguraBot Saúde"
  },
  {
    "category": "Geral Amil",
    "question": "Qual a carencia do plano da Amil?",
    "answer": "A carência regulamentar do plano de saúde da Amil é de 10 meses.",
    "source": "regulamento amil"
  },
  {
    "category": "Doenças Preexistentes",
    "question": "O plano cobre doenças preexistentes?",
    "answer": "Sim, de acordo com as diretrizes da ANS, o plano Executivo SeguraBot Saúde cobre o tratamento de Doenças ou Lesões Preexistentes (DLP). Há um período de CPT (Cobertura Parcial Temporária) de até 24 meses a partir da adesão para procedimentos de alta complexidade, leitos de CTI/UTI e cirurgias relacionados exclusivamente à doença declarada. Consultas simples e procedimentos de rotina seguem as carências comuns sem restrições.",
    "source": "Regulamento de DLP SeguraBot Saúde"
  },
  {
    "category": "Carência Geral",
    "question": "Qual é o prazo de carência do plano?",
    "answer": "As carências padrão do plano Executivo SeguraBot Saúde são: 24 horas para urgências e emergências médicas; 30 dias para consultas e exames laboratoriais simples; 180 dias para exames de alta complexidade, fisioterapia e internações clínicas/cirúrgicas; e 300 dias para parto a termo. Isenções de carência podem ocorrer em campanhas especiais ou na portabilidade de planos anteriores.",
    "source": "Tabela Oficial de Carências SeguraBot Saúde"
  },
  {
    "category": "Internações e Cirurgias",
    "question": "O plano cobre internações e cirurgias?",
    "answer": "Sim, o plano garante cobertura hospitalar integral com obstetrícia. Isso inclui internações clínicas e cirúrgicas sem limite de dias, em quarto particular (apartamento) com direito a acompanhante durante todo o período de hospitalização, além de cirurgias eletivas (agendadas) e cirurgias de urgência em todos os hospitais credenciados, respeitados os prazos regulamentares de carência.",
    "source": "Termos de Cobertura Hospitalar"
  },
  {
    "category": "Rede Credenciada",
    "question": "Quais hospitais fazem parte da rede credenciada?",
    "answer": "A rede credenciada do plano Executivo SeguraBot Saúde conta com hospitais de excelência nacional. Em São Paulo, inclui o Hospital Sírio-Libanês, Hospital Israelita Albert Einstein e Hospital Oswaldo Cruz. No Rio de Janeiro, conta com o Hospital Copa Star e Hospital Samaritano. A rede completa de clínicas, laboratórios (como Fleury e Delboni) e prontos-socorros locais pode ser consultada a qualquer momento diretamente no seu painel do cliente ou pelo aplicativo.",
    "source": "Guia de Hospitais e Rede Credenciada"
  },
  {
    "category": "Reajuste do Plano",
    "question": "Como funciona o reajuste do plano?",
    "answer": "O reajuste do plano ocorre em duas situações regulamentadas: 1) Reajuste Anual, aplicado na data de aniversário do contrato com base no índice autorizado pela ANS (para planos individuais/familiares) ou sinistralidade acordada (para planos coletivos); e 2) Reajuste por Faixa Etária, que ocorre quando o beneficiário muda de faixa de idade, conforme as 10 faixas oficiais autorizadas pela legislação vigente da ANS.",
    "source": "Contrato de Adesão e Regulamento ANS"
  }
];

export class FirebaseKnowledgeBaseRepository implements IKnowledgeBaseRepository {
  private embeddingService = new DynamicEmbeddingService();

  async searchRelevantContext(userQuery: string): Promise<KnowledgeBaseEntry[]> {
    try {
      // 1. Gerar embedding para a query do usuário
      let queryEmbedding: number[] | null = null;
      if (!isFirebaseRestricted) {
        try {
          queryEmbedding = await this.embeddingService.generateEmbedding(userQuery);
        } catch (e) {
          console.warn("Erro ao gerar embedding para busca, usando fallback de palavra-chave:", e);
        }
      }

      // 2. Buscar entradas da base de conhecimento
      let allEntries: any[] = [];
      if (!isFirebaseRestricted) {
        try {
          const kbRef = collection(db, 'knowledge_base');
          const q = query(kbRef);
          const snapshot = await getDocs(q);
          allEntries = snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as any)
          );
        } catch (error) {
          console.warn("Erro ao buscar base de conhecimento do Firestore, ativando fallback local imediato:", error);
          setFirebaseRestricted(true);
        }
      }

      // Se estiver restrito ou não obteve nada, usar local FAQ
      if (allEntries.length === 0) {
        allEntries = LOCAL_FAQ.map((item, idx) => ({
          id: `local-kb-${idx}`,
          category: item.category,
          question: item.question,
          answer: item.answer,
          source: item.source,
          embedding: null
        }));
      }

      // 3. Rankear por similaridade de cosseno ou fallback por palavra-chave
      const scoredEntries = allEntries.map(entry => {
        let score = 0;

        if (queryEmbedding && entry.embedding) {
          score = this.cosineSimilarity(queryEmbedding, entry.embedding);
        } else {
          // Fallback para busca por palavra-chave (Case-insensitive)
          const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const textToSearch = `${entry.category} ${entry.question} ${entry.answer}`.toLowerCase();
          
          queryWords.forEach(word => {
            if (textToSearch.includes(word)) score += 0.3; // Score significativo para casamento de palavras
          });
        }

        return { entry, score };
      });

      // Ordenar por score descendente e pegar os top 3
      const relevantEntries = scoredEntries
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(item => item.entry as KnowledgeBaseEntry);

      return relevantEntries;

    } catch (error) {
      console.error('Error fetching knowledge base:', error);
      // Fallback em caso de erro crítico
      const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const matched = LOCAL_FAQ.filter(entry => {
        const textToSearch = `${entry.category} ${entry.question} ${entry.answer}`.toLowerCase();
        return queryWords.some(word => textToSearch.includes(word));
      }).slice(0, 3).map((item, idx) => ({
        id: `critical-fallback-kb-${idx}`,
        category: item.category,
        question: item.question,
        answer: item.answer,
        source: item.source
      } as KnowledgeBaseEntry));

      return matched;
    }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let mA = 0;
    let mB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      mA += vecA[i] * vecA[i];
      mB += vecB[i] * vecB[i];
    }
    mA = Math.sqrt(mA);
    mB = Math.sqrt(mB);
    if (mA === 0 || mB === 0) return 0;
    return dotProduct / (mA * mB);
  }
}
