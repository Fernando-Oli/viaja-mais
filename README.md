# Viaja+ 🌍

Sistema completo de planejamento e gestão de viagens em grupo.

## 📋 Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Funcionalidades](#funcionalidades)
- [Tecnologias Utilizadas](#tecnologias-utilizadas)
- [Pré-requisitos](#pré-requisitos)
- [Instalação e Configuração](#instalação-e-configuração)
- [Execução](#execução)
- [Comandos](#comandos)
- [Docker](#docker-produção)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Documentação Adicional](#documentação-adicional)

## 🎯 Sobre o Projeto

O **Viaja+** é uma aplicação web moderna que centraliza todo o planejamento e gestão de viagens, oferecendo uma experiência prática, organizada e eficiente. A plataforma permite que viajantes gerenciem todos os aspectos de suas viagens em um único lugar, desde reservas até controle financeiro, com suporte completo para viagens em grupo.

### Problema Resolvido

Atualmente, o planejamento de viagens é fragmentado entre diversas plataformas, causando:
- Perda de informações importantes
- Dificuldades no controle financeiro
- Falta de coordenação em viagens em grupo
- Experiências frustrantes e desorganizadas

### Solução

O Viaja+ integra todas as funcionalidades necessárias em uma única plataforma:
- ✅ Gestão centralizada de viagens
- ✅ Controle financeiro integrado
- ✅ Colaboração em grupo com sistema de convites
- ✅ Integração com Google Maps
- ✅ Organização de itinerários
- ✅ Gerenciamento de reservas

## 🚀 Funcionalidades

### Autenticação e Segurança
- Login, cadastro e recuperação de senha por e-mail (Better Auth, na própria API)
- Proteção de rotas
- Row Level Security (RLS) no banco de dados

### Gestão de Viagens
- Criar, editar e visualizar viagens
- Definir orçamento e datas
- Acompanhar status (planejando, confirmada, em andamento, concluída)
- Adicionar imagem de capa

### Viagens em Grupo
- Adicionar membros à viagem
- Sistema de convites por email
- Notificações de convites pendentes
- Permissões compartilhadas (todos os membros podem editar)

### Itinerário Interativo
- Adicionar atividades dia a dia
- Categorizar por tipo (hospedagem, transporte, atividade, restaurante, atração)
- Definir horários e locais
- Visualização organizada por data

### Controle Financeiro
- Registrar despesas por categoria
- Acompanhar gastos vs orçamento
- Visualização por viagem e categoria
- Alertas visuais de orçamento
- Suporte a múltiplas moedas

### Integração Google Maps
- Buscar lugares com autocomplete
- Salvar lugares favoritos
- Adicionar avaliações e notas
- Visualizar lugares no mapa

### Sistema de Reservas
- Gerenciar voos, hotéis, carros e atividades
- Números de confirmação
- Status de reservas
- Visualização consolidada

## 🛠 Tecnologias Utilizadas

### Frontend
- **Next.js 16** - Framework React com App Router
- **React 19** - Biblioteca UI
- **TypeScript** - Tipagem estática
- **Tailwind CSS v4** - Estilização
- **shadcn/ui** - Componentes UI

### Backend & Database
- **API em Hono** (`api/`) - toda leitura e escrita passa por ela
- **PostgreSQL** próprio, com Row Level Security, acessado por Kysely
- **Better Auth** - sessão com estado no banco, hash scrypt
- **S3** - fotos de perfil (AWS em produção, SeaweedFS local)

### Integrações
- **Google Maps JavaScript API** - Mapas e busca de lugares
- **Google Places API** - Autocomplete de lugares

### Ferramentas de Desenvolvimento
- **npm** - Gerenciador de pacotes (o lockfile do repositório é o `package-lock.json`)
- **ESLint** - Linting
- **PostCSS** - Processamento CSS

## 📦 Pré-requisitos

- **Node.js 22+**
- **Docker Desktop** — o banco (Postgres), o e-mail (Mailpit) e o armazenamento
  (SeaweedFS) rodam em contêineres, pelo `docker-compose.yml`. Sem ele dá para
  mexer em tela e regra de negócio, mas não dá para rodar a API, os testes de
  RLS nem o E2E.
- Uma chave da **Google Maps JavaScript API** (peça ao Fernando)

## ⚙️ Instalação e Configuração

```bash
git clone https://github.com/Fernando-Oli/viaja-mais.git
cd viaja-mais
npm ci
npm run setup
```

O `setup` sobe os serviços, recria o banco (migrations + seed) e **escreve o
`.env.local` sozinho**. Fora de produção, a API já usa os endereços locais como
padrão (`api/env.ts`).

Nenhuma credencial de banco precisa ser enviada por mensagem: cada pessoa tem o
próprio Postgres, com senhas que só valem na máquina dela. A única variável que
vem de fora é a `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — acrescente ao `.env.local`.

## 🚀 Execução

```bash
npm run api:dev          # API em http://localhost:3001
npm run dev              # aplicação em http://localhost:3000
npm run verify           # lint + tipos + testes + build (o mesmo gate do CI)
```

| Serviço | Endereço |
|---|---|
| Aplicação | http://localhost:3000 |
| API | http://localhost:3001 |
| Banco | `postgresql://localhost:55432/avori` |
| E-mails de teste | http://localhost:58025 |

O último é o Mailpit: convite e recuperação de senha caem ali, sem sair da máquina.

**Login de teste:** `teste.a@viajamais.local` / `Viaja+mais123`
(existe também `teste.b@`, para provar isolamento entre usuários nos testes.)

## 🧰 Comandos

| Comando | O que faz |
|---|---|
| `npm run setup` | Sobe o ambiente e gera o `.env.local`. Idempotente. |
| `npm run db:reset` | Recria o banco: migrations + seed |
| `npm run db:types` | Regenera `api/db/tipos.ts` (tipos do Kysely) |
| `npm run db:down` | Derruba os serviços locais |
| `npm run test` | Testes unitários |
| `npm run test:rls` | RLS com dois usuários e integração da API, contra o banco |
| `npm run e2e` | Playwright |
| `npm run lint` | ESLint (com teto de avisos herdados) |

## 🐳 Docker (produção)

```bash
docker compose up --build
```

As variáveis `NEXT_PUBLIC_*` precisam existir no **build**, não só no runtime: o
Next as embute no bundle do navegador. O `docker-compose.yml` já as passa como
build args a partir do seu `.env.local`.


## 📁 Estrutura do Projeto

\`\`\`
viaja-plus/
├── app/                          # App Router do Next.js
│   ├── auth/                     # Páginas de autenticação
│   │   ├── login/
│   │   ├── sign-up/
│   │   └── sign-up-success/
│   ├── dashboard/                # Área autenticada
│   │   ├── bookings/            # Reservas
│   │   ├── finances/            # Controle financeiro
│   │   ├── itinerary/           # Itinerário consolidado
│   │   ├── places/              # Lugares salvos
│   │   ├── settings/            # Configurações
│   │   └── trips/               # Gestão de viagens
│   │       ├── [id]/            # Detalhes da viagem
│   │       │   ├── bookings/
│   │       │   ├── expenses/
│   │       │   ├── itinerary/
│   │       │   └── places/
│   │       └── new/             # Nova viagem
│   ├── layout.tsx               # Layout raiz
│   ├── page.tsx                 # Landing page
│   └── globals.css              # Estilos globais
├── components/                   # Componentes React
│   ├── ui/                      # Componentes shadcn/ui
│   ├── dashboard-layout.tsx     # Layout do dashboard
│   ├── google-map.tsx           # Componente de mapa
│   ├── place-search.tsx         # Busca de lugares
│   ├── trip-members.tsx         # Gestão de membros
│   └── trip-invitations.tsx     # Convites de viagem
├── api/                         # API em Hono (rotas, auth, banco)
├── db/                          # Postgres: init, migrations e seed
├── lib/                         # Regras e utilitários compartilhados
├── scripts/                     # Scripts SQL
│   ├── 001_create_tables.sql
│   └── 002_add_group_travel.sql
├── types/                       # Definições TypeScript
├── middleware.ts                # Middleware Next.js
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.mjs
\`\`\`

## 📚 Documentação Adicional

- [Arquitetura e Documentação Técnica](./ARCHITECTURE.md)
- [Manual do Usuário](./USER_MANUAL.md)
- [Modelo de Negócio](./BUSINESS_MODEL.md)
- [Histórico de Versões](./CHANGELOG.md)

## 🔒 Segurança

- Autenticação pelo Better Auth, na própria API, com sessão validada no servidor
- Row Level Security (RLS) em todas as tabelas
- Proteção de rotas via middleware
- Validação de dados no cliente e servidor
- API Keys protegidas por restrições de domínio

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 👥 Autores

Desenvolvido como projeto de sistema de gestão de viagens.

## 📞 Suporte

Para suporte, abra uma issue no repositório ou entre em contato através do email de suporte.

---

**Viaja+** - Planeje suas viagens com inteligência e praticidade! 🌍✈️
