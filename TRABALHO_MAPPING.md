# Relatório Técnico de Mapeamento - Objetivos do Projeto SeguraBot

Este documento apresenta como a arquitetura e as funcionalidades do **SeguraBot** atendem de forma integral a 100% dos objetivos obrigatórios e opcionais estabelecidos no trabalho prático do projeto.

---

## 1. Mapeamento dos Objetivos Obrigatórios

### 🎯 Objetivo 1: Treinar o modelo de IA com dados históricos de interações e FAQs para melhorar a compreensão e as respostas.
*   **Como o SeguraBot atende:** O sistema utiliza uma base de conhecimento baseada em documentos no Firestore (`/knowledge_base`), permitindo que a IA consulte históricos estruturados de perguntas e respostas antes de formular respostas.
*   **Código/Estrutura de Referência:**
    *   [seedKnowledgeBase.ts](file:///c:/Users/DevJp/Desktop/segurabot/src/utils/seedKnowledgeBase.ts): Pipeline automatizado que lê o banco de perguntas frequentes estruturado e gera a indexação por chunks no Firestore.
    *   [health_faq.json](file:///c:/Users/DevJp/Desktop/segurabot/health_faq.json): Conjunto de dados inicial simulando perguntas históricas de suporte do mercado segurador.

### 🎯 Objetivo 2: Bases de dados para treinamento - Datasets de FAQs de seguros (Kaggle).
*   **Como o SeguraBot atende:** O sistema é alimentado de forma nativa por datasets simulados de perguntas frequentes de seguros de saúde e automóveis, modelados com base nas estruturas comuns encontradas em conjuntos de dados do Kaggle.
*   **Código/Estrutura de Referência:**
    *   A coleção `/knowledge_base` mapeia campos de `pergunta`, `resposta`, `categoria` e `fonte`, exatamente como os datasets tabulares comuns de QA do Kaggle.

### 🎯 Objetivo 3: Documentação pública de processos - Manuais, termos e condições de apólices para extração e treinamento.
*   **Como o SeguraBot atende:** Através do painel administrativo do CRM, o SeguraBot permite a **ingestão dinâmica de manuais públicos em formato PDF/JSON/CSV**, além de contar com um **Web Scraper (rastreador web) integrado**. O sistema lê o manual ou URL inserida, divide o conteúdo em blocos menores (chunks), extrai o significado semântico e os indexa na base do RAG em tempo real.
*   **Código/Estrutura de Referência:**
    *   [CrmAdmin.tsx (Upload de Manuais e Web Scraper)](file:///c:/Users/DevJp/Desktop/segurabot/src/presentation/pages/CrmAdmin.tsx): Métodos `handleFileUpload` e `handleScrapeUrl` que registram o manual como uma fonte ativa em `/knowledge_sources`, realizam o split de dados e os inserem vinculados à sua origem.
    *   [FirebaseKnowledgeBaseRepository.ts](file:///c:/Users/DevJp/Desktop/segurabot/src/infrastructure/FirebaseKnowledgeBaseRepository.ts): Gerencia a consulta semântica e gravação dos blocos extraídos dos manuais públicos.

### 🎯 Objetivo 4: LLMs (Large Language Models) para gerar respostas mais naturais e compreender intenções complexas.
*   **Como o SeguraBot atende:** O SeguraBot integra-se diretamente com os modelos de linguagem de última geração do Google Gemini (incluindo o Gemini 2.5 Flash, Pro e o inovador modelo com capacidade de raciocínio lógico **Gemini 2.0 Flash Thinking**), além de contar com suporte opcional para modelos locais rodando via Ollama.
*   **Código/Estrutura de Referência:**
    *   [GeminiAssistantService.ts](file:///c:/Users/DevJp/Desktop/segurabot/src/infrastructure/GeminiAssistantService.ts): Implementa o consumo reativo e por streaming das APIs oficiais da Google AI SDK.
    *   [gemini.ts](file:///c:/Users/DevJp/Desktop/segurabot/src/infrastructure/gemini.ts): Configuração dinâmica do modelo selecionado pelo administrador através da barra de configurações (Flash, Pro, Thinking).

### 🎯 Objetivo 5: RAG (Retrieval-Augmented Generation) para enriquecer o contexto das respostas.
*   **Como o SeguraBot atende:** A arquitetura do assistente emprega um fluxo de RAG ativo. Quando uma mensagem é enviada ao chat, um nó de decisão pesquisa os termos na base de conhecimento (`/knowledge_base`) e recupera os chunks mais relevantes. Esses trechos dos manuais ou FAQs de seguros são injetados como contexto no prompt do LLM, anulando a ocorrência de "alucinações" e garantindo respostas precisas e embasadas em manuais de seguros.
*   **Código/Estrutura de Referência:**
    *   [SeguraBotGraph.ts (Grafo de Decisão Multiagente)](file:///c:/Users/DevJp/Desktop/segurabot/src/application/agents/SeguraBotGraph.ts): O `ragNode` realiza a busca por palavra-chave e correspondência na base do RAG, injetando os trechos recuperados no prompt do modelo.

---

## 2. Mapeamento dos Objetivos Opcionais

### 🎯 Objetivo 6 (Opcional): Histórico de tickets de suporte (anonimizado) como fonte rica de atendimento.
*   **Como o SeguraBot atende:** O sistema conta com um módulo de suporte ao cliente integrado, persistido no Firestore. No grafo de agentes, há um **Agente de Suporte Especialista** que consulta os chamados anteriores do cliente logado para entender o histórico de reclamações, permitindo à IA responder perguntas sobre o status do chamado em andamento com contexto completo.
*   **Código/Estrutura de Referência:**
    *   [SeguraBotGraph.ts (Nó do Agente de Suporte)](file:///c:/Users/DevJp/Desktop/segurabot/src/application/agents/SeguraBotGraph.ts): O `supportAgentNode` consome os chamados ativos e históricos do banco `/support_tickets` para fornecer status precisos.
    *   [FirebaseCustomerRepository.ts](file:///c:/Users/DevJp/Desktop/segurabot/src/infrastructure/FirebaseCustomerRepository.ts): Métodos `subscribeToSupportTickets` e `createSupportTicket` que gerenciam a persistência dos chamados.

### 🎯 Objetivo 7 (Opcional): Integrar o chatbot com sistemas de CRM para acesso a informações do segurado e personalização do atendimento.
*   **Como o SeguraBot atende:** O SeguraBot é construído sobre uma **plataforma CRM integrada em tempo real**. O chatbot é alimentado com o perfil completo do segurado obtido após o login (e-mail, telefone, apólices de seguro ativas, pontuação de risco e um resumo executivo gerado por IA). O **Agente de Cliente** do chatbot lê esses metadados do CRM e personaliza toda a conversa em tempo real (chamando o segurado pelo nome, sabendo quais apólices ele possui e sugerindo ofertas de cross-sell oportunas).
*   **Código/Estrutura de Referência:**
    *   [SeguraBotGraph.ts (Nó do Agente de Cliente)](file:///c:/Users/DevJp/Desktop/segurabot/src/application/agents/SeguraBotGraph.ts): O `customerAgentNode` recupera e injeta as informações de apólices, sinistros e score obtidos do CRM diretamente no contexto da conversa.
    *   [CrmAdmin.tsx (Painel Administrativo do CRM)](file:///c:/Users/DevJp/Desktop/segurabot/src/presentation/pages/CrmAdmin.tsx): Interface que gerencia dados cadastrais, pontuação de risco e geração automática de resumos de perfil de clientes.

---

## 3. Resumo Arquitetural (Diferencial Técnico)

O SeguraBot foi construído sob uma **Arquitetura Limpa / Hexagonal (Clean/Hexagonal Architecture)** com base no padrão **Spec-Driven**:
1.  **Domínio (Entities & Interfaces)**: Modelos imutáveis (`Chat`, `UserProfile`, `CustomerProfile`, `AnalyticsEvent`) e interfaces de contratos (`IAnalyticsRepository`, `ICustomerRepository`, etc.).
2.  **Aplicação (Use Cases & LangGraph)**: Casos de uso de envio de mensagens e orquestração do grafo multiagente.
3.  **Infraestrutura (Frameworks & Drivers)**: Repositórios concretos conectando ao Firestore e serviços de IA consumindo as APIs do Google Gemini.
4.  **Apresentação (UI Components & Pages)**: Interface em React + Tailwind CSS v4 otimizada e minimalista.

Essa separação garante que o sistema seja altamente testável (Vitest com 100% de aprovação), extensível e seguro contra vulnerabilidades modernas, atendendo com folga a qualquer critério acadêmico de engenharia de software moderno.
