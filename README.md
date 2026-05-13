# SeguraBot

O **SeguraBot** é uma plataforma de assistente virtual baseada em Inteligência Artificial, construída com foco em segurança, manutenibilidade e um design premium. A aplicação utiliza uma abordagem de IA híbrida (integrando o Google Gemini e suporte opcional para modelos locais como Ollama) aliada a um banco de dados em tempo real (Firebase) para a gestão do histórico e autenticação.

## Equipe e Informações do Projeto
* **Membros da Equipe:** Felipe Rafael dos Santos Barbosa, João Paulo da Silva Cardoso e Victor Amazonas Viegas Ferreira.
* **Repositório Oficial:** [GitHub - segurabot](https://github.com/jpscard/segurabot)

## Objetivos do Produto
* Prover uma interface de chat inteligente e segura para os usuários finais.
* Garantir um código-fonte altamente sustentável através de uma **Arquitetura Spec-Driven** (Arquitetura Limpa/Hexagonal).
* Oferecer uma experiência de usuário (UX) excepcional, com interface minimalista e profissional, alinhada às melhores práticas de design de software moderno.

## UI/UX
* **Minimalismo Absoluto:** Interface extremamente limpa, sem o uso de ícones ou emojis.
* **Navegação e Controles:** Navegação através de botões estilizados.
* **Estética Visual:** Suporte a temas Claro e Escuro (Light e Dark modes).

## Funcionalidades
* **Autenticação:** Cadastro, login e logout seguros via Firebase Auth.
* **Gestão de Sessões de Chat:** Histórico e persistência de sessões no Firestore.
* **Motor de IA e RAG:** Integração com APIs do Gemini 1.5 Flash para processar arquivos, gerar embeddings e realizar Retrieval-Augmented Generation (RAG) utilizando Firebase como Knowledge Base.
* **CRM Integrado:** Integração inicial com dados simulados de CRM de clientes para respostas personalizadas.

## Como Rodar o Projeto

**Pré-requisitos:** Node.js v18+

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Configure suas variáveis de ambiente. Crie um arquivo `.env` (ou `.env.local`) na raiz do projeto com as chaves necessárias (Firebase, Gemini API Key, etc):
   ```env
   VITE_GEMINI_API_KEY=sua_chave_aqui
   VITE_FIREBASE_API_KEY=sua_chave_aqui
   # Adicione as demais variáveis de configuração do Firebase
   ```

3. Inicie a aplicação localmente:
   ```bash
   npm run dev
   ```
