# SeguraBot - Specification-Driven Architecture

## 1. O Problema Atual (Component-Driven)
Atualmente, a lógica de negócio do SeguraBot (como chamar a API do Gemini e salvar conversas no Firebase) está misturada dentro de componentes de UI como o `Dashboard.tsx` ou em funções utilitárias avulsas (`lib/firebase.ts` e `lib/gemini.ts`). 
Se o Gemini mudar a API, ou se migrarmos do Firebase para um backend próprio, teremos que reescrever boa parte dos componentes visuais do React.

## 2. A Solução: Spec-Driven (Arquitetura Limpa / Hexagonal)
Nossa meta é isolar as Regras de Negócio da Infraestrutura e da Tela (UI).

### 2.1 Camada de Domínio (Domain)
Aqui ficam as "Especificações" puras. São as interfaces e contratos que o nosso sistema deve obedecer, sem conhecer Firebase ou React.

*   **Entidades:** `User`, `ChatSession`, `Message`, `KnowledgeBaseEntry` (Já temos parte disso em `types.ts`).
*   **Contratos de Repositório (Ports):**
    *   `IChatRepository`: Contratos como `getSessions(userId)`, `saveMessage(sessionId, message)`.
    *   `IAuthRepository`: Contratos como `login()`, `logout()`, `getCurrentUser()`.
*   **Contratos de Serviços Externos:**
    *   `IAIAssistantService`: Contrato abstrato `generateResponse(prompt, context)`.

### 2.2 Camada de Aplicação (Use Cases)
Onde a lógica do aplicativo orquestra os repositórios.
*   `SendMessageUseCase`: Recebe a mensagem do usuário, salva no `IChatRepository`, chama o `IAIAssistantService` e salva a resposta da IA. A UI só chama esse caso de uso.

### 2.3 Camada de Infraestrutura (Infrastructure / Adapters)
As implementações concretas dos contratos do Domínio.
*   `FirebaseChatRepository implements IChatRepository`: Usa o SDK do Firebase Firestore.
*   `GeminiAssistantService implements IAIAssistantService`: Faz a requisição HTTP para o Google Gemini.

### 2.4 Camada de Apresentação (Presentation / UI)
Componentes React (`Dashboard.tsx`, `Landing.tsx`) limpos, focados apenas em gerenciar o estado local da tela e renderizar a beleza do TailwindCSS, consumindo os Use Cases via injeção de dependência ou Context API.

## 3. Alinhamento com "Harness Engineering" (Testes e Isolamento)
A grande vantagem de adotarmos a arquitetura Spec-Driven é que ela é a base perfeita para **Harness Engineering** (Engenharia de Testes em Ambientes Isolados). 
Como separamos as responsabilidades através de Contratos (Interfaces), podemos facilmente:
*   **Criar Test Harnesses (Ambientes de Teste):** Testar toda a lógica do ChatBot (Aplicação e Domínio) injetando um `MockFirebaseRepository` e um `MockGeminiService`. O teste roda em milissegundos sem gastar cota da API ou bater no banco real.
*   **Isolamento de UI:** Podemos testar o comportamento visual da tela passando dados falsos injetados nos Use Cases (ótimo para ferramentas como Storybook ou Vitest/Jest).
*   **CI/CD Pipeline Seguro:** Como os testes de Use Cases serão extremamente rápidos e não dependerão de rede, garantimos deploys sem medo de quebrar a lógica principal do *SeguraBot*.

---

## Próximos Passos (Plano de Refatoração)

4.  **Reestruturação de Pastas:** (Em andamento) Consolidar o código na estrutura estrita da Clean Architecture (`domain`, `application`, `infrastructure`, `presentation`), eliminando pastas legadas.
5.  **Refatorar o `Dashboard.tsx`:** (Em andamento) O consumo de casos de uso para envio de mensagem (`ProcessUserMessageUseCase`) já foi implementado, mas ainda falta extrair as chamadas diretas de banco de dados (Firestore) para hooks/repositórios.

## 4. Pipeline de RAG e Ingestão de Conhecimento (Data Pipeline)
Para suportar as funcionalidades inteligentes do assistente, a arquitetura incorpora um pipeline de RAG (Retrieval-Augmented Generation) dinâmico e flexível.

### 4.1 Ingestão de Dados (Upload e Processamento)
O sistema é capaz de ingerir dados históricos e documentações para alimentar o banco vetorial / base de conhecimento no Firebase Firestore.
*   **Dados Estruturados (CSV/JSON):** Importação de Datasets (ex: Kaggle) convertendo `category`, `question` e `answer` diretamente para a coleção `knowledge_base`.
*   **Dados Não Estruturados (PDFs):** O upload de manuais e apólices em PDF utiliza as capacidades multimodais do LLM (ex: Gemini 2.5 Flash via `File API` ou `inlineData`) como um motor de "Intelligent Document Processing" (IDP). A IA lê o PDF, extrai FAQs e devolve um JSON estruturado pronto para ingestão.
*   **Web Scraping RAG (URLs):** Os administradores podem inserir links públicos de termos de apólices ou processos. O sistema raspa o link, extrai FAQs semânticas via IA e as indexa automaticamente na base de conhecimento.

### 4.2 Arquitetura de RAG
1.  **Recuperação (Retrieval):** O `IKnowledgeBaseRepository` (implementado pelo adaptador do Firebase) busca no Firestore o contexto relevante com base no input do usuário.
2.  **Aumento (Augmentation):** O `ProcessUserMessageUseCase` injeta essas regras, manuais ou FAQs no *System Prompt* do `IAIAssistantService`.
3.  **Geração (Generation):** O LLM gera a resposta combinando sua inteligência natural com as verdades (ground truth) extraídas dos dados da seguradora.

### 4.3 Integração CRM & Histórico de Suporte (Implementados)
Todas as integrações ricas de personalização foram implementadas com sucesso:
*   **Histórico de Atendimentos (Tickets de Suporte):** Persistência na coleção `/support_tickets`. O `supportAgentNode` no grafo de decisão multiagente consome os chamados ativos e anteriores para calibração de status.
*   **Integração CRM:** O repositório `FirebaseCustomerRepository` busca o perfil de cadastro do cliente logado, fornecendo à IA dados sobre apólices detalhadas, sinistros, pontuação de risco e resumos inteligentes para que o chatbot personalize reativamente as tratativas.

---

## 5. Blindagem Digital & Monitoramento (Implementados)

### 5.1 Barreiras de Segurança (Security Guardrails)
*   **Prompt Injection:** Análise léxica ativa no caso de uso que intercepta tentativas de subversão de prompt antes de enviar os dados à API Gemini.
*   **SSRF Protection:** Validador de IP/URL privada na raspagem de links da web que impede varreduras na intranet física do servidor.
*   **Controle de Acesso Reativo (RBAC):** Escrita nas coleções de conhecimento (`knowledge_base` e `knowledge_sources`) restrita unicamente a papéis de `admin` e `atendente` através de checagem do perfil no Firestore.

### 5.2 RAG Web Analytics & Funil de Conversão
Monitoramento passivo anônimo (em conformidade com a LGPD) que coleta visitas, abertura do widget, mensagens enviadas e conversão final no CRM.
*   **Painel Administrativo:** Exibe cards de KPIs (visitantes, cliques, bounce rate e leads), gráfico de funil reativo em CSS nativo e log de eventos filtráveis por data (Tudo, Hoje, 7 Dias, 30 Dias ou personalizado).
