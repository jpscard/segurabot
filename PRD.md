# Product Requirements Document (PRD) - SeguraBot

## 1. Visão Geral do Produto
O **SeguraBot** é uma plataforma de assistente virtual baseada em Inteligência Artificial, construída com foco em segurança, manutenibilidade e um design premium. A aplicação utiliza uma abordagem de IA híbrida (integrando o Google Gemini e suporte opcional para modelos locais como Ollama) aliada a um banco de dados em tempo real (Firebase) para a gestão do histórico e autenticação.

## 2. Equipe e Informações do Projeto
*   **Membros da Equipe:** Felipe Rafael dos Santos Barbosa, João Paulo da Silva Cardoso e Victor Amazonas Viegas Ferreira
*   **Repositório Oficial:** [GitHub - uci_ai](https://github.com/jpscard/uci_ai/tree/main)

## 3. Objetivos do Produto
*   Prover uma interface de chat inteligente e segura para os usuários finais.
*   Garantir um código-fonte altamente sustentável através de uma **Arquitetura Spec-Driven** (Arquitetura Limpa/Hexagonal).
*   Oferecer uma experiência de usuário (UX) excepcional, com interface minimalista e profissional, alinhada às melhores práticas de design de software moderno.

## 4. Requisitos de Design e Experiência do Usuário (UI/UX)
De acordo com as diretrizes de design estabelecidas, a interface do SeguraBot deve seguir rigorosamente as seguintes regras:
*   **Minimalismo e Design Profissional:** A interface deve ser limpa e seguir as referências do CRM UI Kit (Figma). **O uso de ícones (SVG, bibliotecas como Lucide) é permitido** para estruturar menus e ações visuais. O uso de emojis continua proibido para garantir um tom sóbrio e profissional.
*   **Navegação e Controles:** Toda a navegação principal e seleções de opções devem ser feitas exclusivamente através de **botões estilizados**. O uso de menus de rádio (radio buttons) não é permitido, visando uma experiência visual mais sofisticada.
*   **Estética Visual:** Suporte nativo, dinâmico e fluido a temas Claro e Escuro (Light e Dark modes).
*   **Apresentação:** Uma Landing Page profissional e elegante, conectada a um fluxo de autenticação seguro.

## 5. Requisitos Funcionais
*   **RF01 - Autenticação:** O sistema deve permitir o cadastro, login e logout de usuários de forma segura, gerenciando sessões ativas através do Firebase Auth.
*   **RF02 - Gestão de Sessões de Chat:** O usuário deve poder iniciar novas conversas, listar o histórico de sessões anteriores e retomá-las sem perda de contexto (persistência via Firestore).
*   **RF03 - Motor de Inteligência Artificial:** O sistema deve processar as mensagens do usuário e gerar respostas contextuais e inteligentes consumindo as APIs de IA configuradas (Gemini).
*   **RF04 - Dashboard Principal:** O painel do usuário deve apresentar a área de chat centralizada, com uma barra lateral ou menu de navegação (usando botões) fluida para acessar históricos e configurações.

## 6. Requisitos Não Funcionais e Arquitetura
A aplicação está adotando o conceito de **Spec-Driven Architecture** (Arquitetura Hexagonal/Clean), com o objetivo de isolar as Regras de Negócio da Infraestrutura técnica e da interface gráfica.

*   **RNF01 - Separação de Responsabilidades:**
    *   `Domain`: Contém as entidades de negócio puras e Contratos (Interfaces) de Repositórios/Serviços. Sem acoplamento com bibliotecas externas.
    *   `Application (Use Cases)`: Orquestração da lógica de negócio. Componentes da UI só interagem com o sistema através destes casos de uso.
    *   `Infrastructure (Adapters)`: Implementações concretas dos contratos do domínio (ex: Adaptadores Firebase e Gemini).
    *   `Presentation`: UI focada em gerenciar estado local, renderização React e consumo de estilo TailwindCSS.
*   **RNF02 - Testabilidade (Harness Engineering):** O design de arquitetura deve permitir a injeção de dependências (Mock Repositories/Services) para que os testes de lógica de negócio rodem em milissegundos, em completo isolamento (sem depender de internet, banco de dados ou cotas de API).
*   **RNF03 - Manutenibilidade e Escalabilidade:** Qualquer mudança nos serviços externos (como a migração de Gemini para Ollama, ou de Firebase para um backend próprio) exigirá **apenas** a criação de novos adaptadores de infraestrutura, sem nenhuma alteração nos componentes React da tela.

## 7. Roadmap e Próximos Passos
1.  **Refatoração Estrutural:** Migração do código atual para a nova estrutura de diretórios (`domain`, `application`, `infrastructure`, `presentation`).
2.  **Limpeza do Dashboard.tsx:** Remoção das chamadas diretas de API (Firestore e Gemini) de dentro do componente, substituindo-as pelo consumo dos respectivos *Use Cases*.
3.  **Auditoria de UI/UX:** Revisar todos os componentes atuais para garantir a conformidade com as regras de design (remover ícones/emojis e substituir radios por botões estilizados).
4.  **Implementação de Testes Isolados:** Criação de testes automatizados unitários para a camada `Application` usando mocks.

## 8. Estratégia de Treinamento e Inteligência Artificial (RAG)
Para garantir que o SeguraBot compreenda o contexto específico do negócio e forneça respostas precisas sem alucinações, o sistema utiliza uma pipeline avançada de Ingestão de Dados e RAG (Retrieval-Augmented Generation).

**O que fazer:**
*   Treinar o modelo de IA com dados históricos de interações e FAQs para melhorar significativamente a compreensão e as respostas.
*   Utilizar LLMs (Large Language Models) como o Gemini para gerar respostas mais naturais e compreender intenções complexas, combinando a extração do documento e a fala humanizada.
*   Aplicar o RAG para buscar ativamente o contexto relevante no Firestore e enriquecer as respostas em tempo real.

**Fontes e Bases de Dados para Treinamento (Ingestão):**
*   **Datasets de FAQs de seguros (Kaggle):** Importação e adaptação de conjuntos de dados estruturados (via uploader .csv/.json) frequentemente hospedados em plataformas como o Kaggle.
*   **Documentação Pública de Processos:** Upload direto de Manuais, Termos e Condições de apólices em formato `.pdf`. A própria pipeline de IA (Gemini File API) faz a leitura, extrai as informações cruciais e converte em perguntas e respostas estruturadas para treinar o chatbot de forma autônoma.

**Roadmap de Integração e Personalização Avançada (CRM & Tickets):**
*   *(Opcional / Próxima Fase)* **Obter histórico de tickets de suporte (anonimizado):** Ingerir dados internos de atendimento como a fonte mais rica e realista para refinar o conhecimento da IA.
*   *(Opcional / Próxima Fase)* **Integrar o chatbot com sistemas de CRM:** (Customer Relationship Management) para prover acesso às informações do segurado em tempo real, permitindo a personalização profunda do atendimento (ex: citar coberturas exatas do usuário logado).
