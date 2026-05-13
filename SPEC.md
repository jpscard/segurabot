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

1.  **Reestruturação de Pastas:** 
    *   `src/domain/models` (Transferir `types.ts`)
    *   `src/domain/repositories` (Criar interfaces)
    *   `src/infrastructure/firebase` (Adaptadores do Firebase)
    *   `src/infrastructure/ai` (Adaptador do Gemini)
    *   `src/application/useCases` (Lógica de chat isolada)
2.  **Refatorar o `Dashboard.tsx`:** Remover chamadas diretas ao Firestore e Gemini de dentro dele.
