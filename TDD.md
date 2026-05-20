# Test-Driven Development (TDD) Plan - SeguraBot

Este documento especifica o plano de testes para o projeto SeguraBot, garantindo que a aplicação mantenha sua integridade, segurança e aderência à Arquitetura Limpa (Clean Architecture).

## 1. Estratégia de Testes

Seguindo o requisito **RNF02 - Testabilidade (Harness Engineering)** do PRD, priorizamos testes rápidos, isolados e determinísticos.

*   **Testes Unitários (Foco Principal):** Validam as regras de negócio na camada de `Application` (Use Cases) e `Domain`. Devem rodar em milissegundos e usar mocks para todas as dependências externas (Firestore, Gemini, etc.).
*   **Testes de Integração:** Validam a comunicação entre os adaptadores de `Infrastructure` e os serviços reais (ou emuladores).
*   **Testes de Componente (UI):** Validam o comportamento da camada de `Presentation` (React) sem acoplamento com a lógica de negócio.

---

## 2. Especificação de Testes Necessários

### 2.1 Camada de Aplicação (Use Cases)

#### `ProcessUserMessageUseCase`
Este é o caso de uso principal do chat.

*   **Teste 1: Sucesso no fluxo padrão**
    *   **Cenário:** Usuário envia uma mensagem válida.
    *   **Esperado:**
        *   A mensagem do usuário deve ser salva no repositório.
        *   O serviço de IA deve ser chamado com o histórico e o prompt enriquecido.
        *   A resposta da IA deve ser salva no repositório.
        *   O callback `onChunk` deve ser chamado para streaming.
*   **Teste 2: Enriquecimento de Contexto (RAG + CRM)**
    *   **Cenário:** Usuário pergunta algo que possui resposta na Base de Conhecimento e ele possui dados no CRM.
    *   **Esperado:** O prompt enviado para o serviço de IA deve conter as informações do perfil do cliente e os trechos relevantes da base de conhecimento.
*   **Teste 3: Falha na busca de contexto**
    *   **Cenário:** O repositório da Base de Conhecimento falha ou retorna vazio.
    *   **Esperado:** O caso de uso deve continuar e enviar a pergunta do usuário mesmo sem contexto adicional, ou usar uma mensagem padrão.
*   **Teste 4: Falha no serviço de IA**
    *   **Cenário:** O serviço de IA (Gemini ou Ollama) lança uma exceção.
    *   **Esperado:** O caso de uso deve propagar o erro de forma tratada e não deve deixar a sessão em estado inconsistente.

---

### 2.2 Camada de Infraestrutura (Adapters)

#### `FirebaseChatRepository`
Valida a persistência de conversas.

*   **Teste 1: Criação e recuperação de sessão**
    *   **Cenário:** Criar uma nova sessão e depois buscá-la pelo ID.
    *   **Esperado:** Os dados recuperados devem ser idênticos aos salvos.
*   **Teste 2: Adição de mensagens**
    *   **Cenário:** Adicionar mensagens a uma sessão existente.
    *   **Esperado:** A lista de mensagens da sessão deve crescer e manter a ordem cronológica.
*   **Teste 3: Atualização de metadados**
    *   **Cenário:** Atualizar o campo `lastMessage` e `updatedAt`.
    *   **Esperado:** Os dados devem ser persistidos corretamente no Firestore.

#### `FirebaseCustomerRepository`
Valida a gestão de dados do cliente.

*   **Teste 1: Busca de perfil existente**
    *   **Cenário:** Buscar perfil de um `userId` que existe na base.
    *   **Esperado:** Retornar o objeto `CustomerProfile` correto.
*   **Teste 2: Busca de perfil inexistente**
    *   **Cenário:** Buscar perfil de um `userId` novo.
    *   **Esperado:** Retornar `null` (sem quebrar a aplicação).
*   **Teste 3: Salvamento de perfil**
    *   **Cenário:** Criar ou atualizar dados de perfil.
    *   **Esperado:** Os dados inseridos devem refletir na consulta subsequente.
*   **Teste 4: Criação e listagem de tickets**
    *   **Cenário:** Criar um ticket de suporte e listar os tickets do usuário.
    *   **Esperado:** O ticket criado deve aparecer na lista ordenado por data decrescente.

#### `FirebaseKnowledgeBaseRepository`
Valida a busca de conhecimento.

*   **Teste 1: Busca por palavra-chave**
    *   **Cenário:** Buscar por um termo presente nas perguntas ou respostas.
    *   **Esperado:** Retornar os documentos relevantes.
*   **Teste 2: Busca sem correspondência**
    *   **Cenário:** Buscar por um termo inexistente.
    *   **Esperado:** Retornar uma lista vazia.

#### `GeminiAssistantService`
Valida a integração com o SDK do Gemini.

*   **Teste 1: Envio de histórico**
    *   **Cenário:** Chamar o serviço passando um histórico de 2 mensagens e um novo prompt.
    *   **Esperado:** Validar se a estrutura enviada para o SDK contém as mensagens anteriores e a nova mensagem no formato correto (`role: 'user' | 'model'`).
*   **Teste 2: Mock de ausência de chave de API**
    *   **Cenário:** Executar o serviço sem a variável `VITE_GEMINI_API_KEY`.
    *   **Esperado:** Retornar a resposta simulada (Mock Mode) via streaming.

---

## 3. Testes de Regras de Segurança (Firestore Rules)

Estes testes garantem que a segurança implementada em `firestore.rules` está funcionando.

*   **Teste 1: Leitura de dados próprios (Permitido)**
    *   **Cenário:** Usuário A tenta ler seu próprio documento em `customers/A`.
    *   **Esperado:** Permitido.
*   **Teste 2: Leitura de dados de terceiros (Bloqueado)**
    *   **Cenário:** Usuário A tenta ler o documento em `customers/B`.
    *   **Esperado:** Erro de permissão negada.
*   **Teste 3: Criação de tickets para si mesmo (Permitido)**
    *   **Cenário:** Usuário A cria um ticket com `userId == 'A'`.
    *   **Esperado:** Permitido.
*   **Teste 4: Criação de tickets para terceiros (Bloqueado)**
    *   **Cenário:** Usuário A tenta criar um ticket com `userId == 'B'`.
    *   **Esperado:** Erro de permissão negada.

---

## 4. Execução dos Testes

O projeto utiliza o **Vitest** para execução dos testes.

*   Para rodar todos os testes: `npm run test`
*   Para rodar em modo watch (desenvolvimento): `npm run test:watch`
