# Viaja+ 🌍

Sistema completo de planejamento e gestão de viagens em grupo.

## 📋 Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Funcionalidades](#funcionalidades)
- [Tecnologias Utilizadas](#tecnologias-utilizadas)
- [Pré-requisitos](#pré-requisitos)
- [Instalação e Configuração](#instalação-e-configuração)
- [Execução](#execução)
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
- Sistema de login e registro com Supabase
- Confirmação de email
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
- **Supabase** - Backend as a Service
  - PostgreSQL Database
  - Authentication
  - Row Level Security
  - Real-time subscriptions

### Integrações
- **Google Maps JavaScript API** - Mapas e busca de lugares
- **Google Places API** - Autocomplete de lugares

### Ferramentas de Desenvolvimento
- **Bun** - Runtime e package manager
- **ESLint** - Linting
- **PostCSS** - Processamento CSS

## 📦 Pré-requisitos

- **Node.js** 18+ ou **Bun** 1.0+
- **Conta Supabase** (gratuita)
- **Google Cloud Account** com Maps API habilitada

## ⚙️ Instalação e Configuração

### 1. Clone o Repositório

\`\`\`bash
git clone <repository-url>
cd viaja-plus
\`\`\`

### 2. Instale as Dependências

\`\`\`bash
# Usando Bun (recomendado)
bun install

# Ou usando npm
npm install
\`\`\`

### 3. Configure o Supabase

#### 3.1. Crie um Projeto no Supabase
1. Acesse [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Anote a URL e as chaves de API

#### 3.2. Execute os Scripts SQL
1. Acesse o SQL Editor no Supabase Dashboard
2. Execute o script `scripts/001_create_tables.sql`
3. Execute o script `scripts/002_add_group_travel.sql`

### 4. Configure o Google Maps API

#### 4.1. Crie um Projeto no Google Cloud
1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um novo projeto
3. Habilite as APIs:
   - Maps JavaScript API
   - Places API
   - Geocoding API

#### 4.2. Crie uma API Key
1. Vá para "Credentials"
2. Crie uma API Key
3. Configure restrições:
   - **HTTP referrers**: `localhost:3000/*`, `*.vercel.app/*`
   - **API restrictions**: Apenas as APIs listadas acima

### 5. Configure as Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto:

\`\`\`env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=sua_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=sua_chave_google_maps

# Site URL (para redirects de email)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000
\`\`\`

## 🚀 Execução

### Desenvolvimento

\`\`\`bash
# Usando Bun
bun dev

# Ou usando npm
npm run dev
\`\`\`

Acesse: [http://localhost:3000](http://localhost:3000)

### Produção

\`\`\`bash
# Build
bun run build

# Start
bun start
\`\`\`

### Docker (Opcional)

\`\`\`bash
# Build da imagem
docker build -t viaja-plus .

# Executar container
docker run -p 3000:3000 --env-file .env.local viaja-plus
\`\`\`

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
├── lib/                         # Utilitários
│   └── supabase/                # Clientes Supabase
│       ├── client.ts            # Cliente browser
│       ├── server.ts            # Cliente server
│       └── middleware.ts        # Cliente middleware
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

- Autenticação via Supabase Auth
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
