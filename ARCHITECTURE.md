# Arquitetura e Documentação Técnica - Viaja+

## 📑 Índice

1. [Visão Geral da Arquitetura](#visão-geral-da-arquitetura)
2. [Arquitetura de Software](#arquitetura-de-software)
3. [Modelo de Dados](#modelo-de-dados)
4. [APIs e Integrações](#apis-e-integrações)
5. [Fluxos de Dados](#fluxos-de-dados)
6. [Requisitos Funcionais](#requisitos-funcionais)
7. [Requisitos Não Funcionais](#requisitos-não-funcionais)
8. [Segurança](#segurança)
9. [Performance e Escalabilidade](#performance-e-escalabilidade)

---

## 1. Visão Geral da Arquitetura

### 1.1 Arquitetura de Alto Nível

\`\`\`
┌─────────────────────────────────────────────────────────┐
│                    Cliente (Browser)                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Next.js 16 App (React 19)              │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐ │  │
│  │  │   Pages    │  │ Components │  │   Hooks    │ │  │
│  │  └────────────┘  └────────────┘  └────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Vercel Edge Network                    │
│              (CDN, Edge Functions, Routing)              │
└─────────────────────────────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
┌───────────────────────┐   ┌───────────────────────┐
│   Supabase Backend    │   │   Google Cloud APIs   │
│  ┌─────────────────┐  │   │  ┌─────────────────┐ │
│  │   PostgreSQL    │  │   │  │   Maps API      │ │
│  │   Database      │  │   │  │   Places API    │ │
│  ├─────────────────┤  │   │  │   Geocoding API │ │
│  │   Auth Service  │  │   │  └─────────────────┘ │
│  ├─────────────────┤  │   └───────────────────────┘
│  │   Storage       │  │
│  ├─────────────────┤  │
│  │   Realtime      │  │
│  └─────────────────┘  │
└───────────────────────┘
\`\`\`

### 1.2 Stack Tecnológico

#### Frontend
- **Framework**: Next.js 16 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **Component Library**: shadcn/ui
- **State Management**: React Hooks + SWR
- **Forms**: React Hook Form + Zod

#### Backend
- **BaaS**: Supabase
- **Database**: PostgreSQL 15
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Real-time**: Supabase Realtime

#### Infraestrutura
- **Hosting**: Vercel
- **CDN**: Vercel Edge Network
- **CI/CD**: Vercel Git Integration
- **Monitoring**: Vercel Analytics

---

## 2. Arquitetura de Software

### 2.1 Padrões Arquiteturais

#### Server-Side Rendering (SSR)
- Páginas renderizadas no servidor para melhor SEO e performance inicial
- Uso de React Server Components para reduzir bundle JavaScript

#### Client-Side Rendering (CSR)
- Componentes interativos renderizados no cliente
- Uso de "use client" para componentes que precisam de interatividade

#### API Routes
- Endpoints serverless para operações específicas
- Autenticação e autorização via middleware

### 2.2 Estrutura de Camadas

\`\`\`
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│  (Pages, Components, UI Elements)       │
└─────────────────────────────────────────┘
                  │
┌─────────────────────────────────────────┐
│         Business Logic Layer            │
│  (Hooks, Utils, Validation)             │
└─────────────────────────────────────────┘
                  │
┌─────────────────────────────────────────┐
│         Data Access Layer               │
│  (Supabase Clients, API Calls)          │
└─────────────────────────────────────────┘
                  │
┌─────────────────────────────────────────┐
│         Data Layer                      │
│  (PostgreSQL, Supabase Services)        │
└─────────────────────────────────────────┘
\`\`\`

### 2.3 Componentes Principais

#### Supabase Clients

**Browser Client** (`lib/supabase/client.ts`)
\`\`\`typescript
// Singleton pattern para cliente browser
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
\`\`\`

**Server Client** (`lib/supabase/server.ts`)
\`\`\`typescript
// Cliente para Server Components e Route Handlers
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
\`\`\`

**Middleware Client** (`lib/supabase/middleware.ts`)
\`\`\`typescript
// Cliente para middleware (refresh de tokens)
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getUser()
  return supabaseResponse
}
\`\`\`

---

## 3. Modelo de Dados

### 3.1 Diagrama Entidade-Relacionamento

\`\`\`
┌─────────────────┐
│   auth.users    │ (Supabase Auth)
└────────┬────────┘
         │ 1
         │
         │ 1
┌────────┴────────┐
│    profiles     │
│─────────────────│
│ id (PK, FK)     │
│ full_name       │
│ avatar_url      │
│ created_at      │
│ updated_at      │
└─────────────────┘
         │ 1
         │
         │ *
┌────────┴────────┐
│      trips      │
│─────────────────│
│ id (PK)         │
│ user_id (FK)    │◄──────────┐
│ title           │           │
│ destination     │           │
│ start_date      │           │
│ end_date        │           │
│ description     │           │
│ budget          │           │
│ currency        │           │
│ cover_image     │           │
│ status          │           │
│ created_at      │           │
│ updated_at      │           │
└────────┬────────┘           │
         │ 1                  │
         │                    │
    ┌────┴────┬───────┬───────┼────────┬──────────┐
    │ *       │ *     │ *     │ *      │ *        │
┌───┴───┐ ┌──┴──┐ ┌──┴──┐ ┌──┴──┐ ┌───┴────┐ ┌──┴──────┐
│itiner-│ │expen│ │book-│ │plac-│ │trip_   │ │trip_    │
│ary_   │ │ses  │ │ings │ │es   │ │members │ │invita-  │
│items  │ │     │ │     │ │     │ │        │ │tions    │
└───────┘ └─────┘ └─────┘ └─────┘ └────────┘ └─────────┘
\`\`\`

### 3.2 Tabelas e Relacionamentos

#### profiles
Estende `auth.users` com informações adicionais do perfil.

\`\`\`sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

#### trips
Armazena informações das viagens.

\`\`\`sql
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT,
  budget NUMERIC(10, 2),
  currency TEXT DEFAULT 'BRL',
  cover_image TEXT,
  status TEXT DEFAULT 'planning' 
    CHECK (status IN ('planning', 'confirmed', 'ongoing', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

#### itinerary_items
Atividades e eventos do itinerário.

\`\`\`sql
CREATE TABLE itinerary_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  category TEXT CHECK (category IN 
    ('accommodation', 'transport', 'activity', 'restaurant', 'attraction', 'other')),
  status TEXT DEFAULT 'planned' 
    CHECK (status IN ('planned', 'confirmed', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

#### expenses
Controle de despesas da viagem.

\`\`\`sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'BRL',
  category TEXT NOT NULL CHECK (category IN 
    ('accommodation', 'transport', 'food', 'activities', 'shopping', 'other')),
  date DATE NOT NULL,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

#### bookings
Reservas de voos, hotéis, carros e atividades.

\`\`\`sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('flight', 'hotel', 'car', 'activity', 'other')),
  title TEXT NOT NULL,
  confirmation_number TEXT,
  provider TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  location TEXT,
  price NUMERIC(10, 2),
  currency TEXT DEFAULT 'BRL',
  status TEXT DEFAULT 'confirmed' 
    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

#### places
Lugares salvos e pontos de interesse.

\`\`\`sql
CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  place_id TEXT,
  category TEXT,
  rating NUMERIC(2, 1),
  notes TEXT,
  visited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

#### trip_members
Membros de viagens em grupo.

\`\`\`sql
CREATE TABLE trip_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, user_id)
);
\`\`\`

#### trip_invitations
Convites para viagens em grupo.

\`\`\`sql
CREATE TABLE trip_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  inviter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invitee_email TEXT NOT NULL,
  invitee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' 
    CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);
\`\`\`

### 3.3 Índices

\`\`\`sql
-- Índices para melhor performance
CREATE INDEX idx_trips_user_id ON trips(user_id);
CREATE INDEX idx_itinerary_items_trip_id ON itinerary_items(trip_id);
CREATE INDEX idx_itinerary_items_date ON itinerary_items(date);
CREATE INDEX idx_expenses_trip_id ON expenses(trip_id);
CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_bookings_trip_id ON bookings(trip_id);
CREATE INDEX idx_places_trip_id ON places(trip_id);
CREATE INDEX idx_trip_members_trip_id ON trip_members(trip_id);
CREATE INDEX idx_trip_members_user_id ON trip_members(user_id);
CREATE INDEX idx_trip_invitations_invitee_email ON trip_invitations(invitee_email);
CREATE INDEX idx_trip_invitations_invitee_id ON trip_invitations(invitee_id);
\`\`\`

---

## 4. APIs e Integrações

### 4.1 Supabase REST API

Todas as operações de dados utilizam a REST API do Supabase via cliente JavaScript.

#### Exemplo de Operações CRUD

**Create**
\`\`\`typescript
const { data, error } = await supabase
  .from('trips')
  .insert({
    user_id: userId,
    title: 'Viagem para Paris',
    destination: 'Paris, França',
    start_date: '2024-06-01',
    end_date: '2024-06-10',
    budget: 5000
  })
  .select()
  .single()
\`\`\`

**Read**
\`\`\`typescript
const { data, error } = await supabase
  .from('trips')
  .select('*, itinerary_items(*), expenses(*)')
  .eq('user_id', userId)
  .order('start_date', { ascending: false })
\`\`\`

**Update**
\`\`\`typescript
const { data, error } = await supabase
  .from('trips')
  .update({ status: 'confirmed' })
  .eq('id', tripId)
  .select()
\`\`\`

**Delete**
\`\`\`typescript
const { error } = await supabase
  .from('trips')
  .delete()
  .eq('id', tripId)
\`\`\`

### 4.2 Supabase Auth API

#### Sign Up
\`\`\`typescript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
    data: {
      full_name: 'João Silva'
    }
  }
})
\`\`\`

#### Sign In
\`\`\`typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})
\`\`\`

#### Sign Out
\`\`\`typescript
const { error } = await supabase.auth.signOut()
\`\`\`

#### Get Session
\`\`\`typescript
const { data: { session } } = await supabase.auth.getSession()
\`\`\`

### 4.3 Google Maps APIs

#### Maps JavaScript API
Carregamento do script:
\`\`\`typescript
useEffect(() => {
  if (!window.google) {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  }
}, [])
\`\`\`

#### Places Autocomplete API
\`\`\`typescript
const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
  types: ['establishment', 'geocode'],
  fields: ['place_id', 'name', 'formatted_address', 'geometry', 'rating']
})

autocomplete.addListener('place_changed', () => {
  const place = autocomplete.getPlace()
  // Processar resultado
})
\`\`\`

---

## 5. Fluxos de Dados

### 5.1 Fluxo de Autenticação

\`\`\`
┌──────────┐
│  Usuário │
└────┬─────┘
     │
     │ 1. Acessa /auth/login
     ▼
┌────────────────┐
│  Login Page    │
└────┬───────────┘
     │
     │ 2. Submete credenciais
     ▼
┌────────────────┐
│ Supabase Auth  │
└────┬───────────┘
     │
     │ 3. Valida e cria sessão
     ▼
┌────────────────┐
│   Middleware   │
└────┬───────────┘
     │
     │ 4. Verifica sessão e redireciona
     ▼
┌────────────────┐
│   Dashboard    │
└────────────────┘
\`\`\`

### 5.2 Fluxo de Criação de Viagem

\`\`\`
┌──────────┐
│  Usuário │
└────┬─────┘
     │
     │ 1. Clica "Nova Viagem"
     ▼
┌────────────────┐
│ /trips/new     │
└────┬───────────┘
     │
     │ 2. Preenche formulário
     ▼
┌────────────────┐
│ Validação Zod  │
└────┬───────────┘
     │
     │ 3. Dados válidos
     ▼
┌────────────────┐
│ Supabase       │
│ INSERT trips   │
└────┬───────────┘
     │
     │ 4. Retorna trip criada
     ▼
┌────────────────┐
│ Redirect para  │
│ /trips/[id]    │
└────────────────┘
\`\`\`

### 5.3 Fluxo de Convite para Viagem em Grupo

\`\`\`
┌──────────┐                    ┌──────────┐
│ Owner    │                    │ Invitee  │
└────┬─────┘                    └────┬─────┘
     │                               │
     │ 1. Envia convite              │
     ▼                               │
┌────────────────┐                  │
│ INSERT         │                  │
│ trip_          │                  │
│ invitations    │                  │
└────┬───────────┘                  │
     │                               │
     │ 2. Email de notificação       │
     ├──────────────────────────────►│
     │                               │
     │                               │ 3. Acessa dashboard
     │                               ▼
     │                          ┌────────────────┐
     │                          │ Vê notificação │
     │                          │ de convite     │
     │                          └────┬───────────┘
     │                               │
     │                               │ 4. Aceita convite
     │                               ▼
     │                          ┌────────────────┐
     │                          │ UPDATE         │
     │                          │ invitation     │
     │                          │ status         │
     │                          └────┬───────────┘
     │                               │
     │                               │ 5. INSERT trip_member
     │                               ▼
     │                          ┌────────────────┐
     │◄─────────────────────────┤ Membro         │
     │ 6. Ambos veem a viagem   │ adicionado     │
     │                          └────────────────┘
\`\`\`

### 5.4 Fluxo de Busca de Lugares

\`\`\`
┌──────────┐
│  Usuário │
└────┬─────┘
     │
     │ 1. Digita no campo de busca
     ▼
┌────────────────┐
│ Autocomplete   │
│ Component      │
└────┬───────────┘
     │
     │ 2. Chama Google Places API
     ▼
┌────────────────┐
│ Google Places  │
│ API            │
└────┬───────────┘
     │
     │ 3. Retorna sugestões
     ▼
┌────────────────┐
│ Dropdown com   │
│ resultados     │
└────┬───────────┘
     │
     │ 4. Usuário seleciona lugar
     ▼
┌────────────────┐
│ Salva no       │
│ Supabase       │
│ (places table) │
└────────────────┘
\`\`\`

---

## 6. Requisitos Funcionais

### RF01 - Autenticação e Autorização
- **RF01.1**: O sistema deve permitir registro de novos usuários com email e senha
- **RF01.2**: O sistema deve enviar email de confirmação após registro
- **RF01.3**: O sistema deve permitir login com email e senha
- **RF01.4**: O sistema deve permitir logout
- **RF01.5**: O sistema deve manter sessão do usuário
- **RF01.6**: O sistema deve proteger rotas autenticadas

### RF02 - Gestão de Perfil
- **RF02.1**: O usuário deve poder visualizar seu perfil
- **RF02.2**: O usuário deve poder editar nome e avatar
- **RF02.3**: O usuário deve poder alterar senha
- **RF02.4**: O usuário deve poder excluir conta

### RF03 - Gestão de Viagens
- **RF03.1**: O usuário deve poder criar nova viagem
- **RF03.2**: O usuário deve poder editar viagem
- **RF03.3**: O usuário deve poder excluir viagem
- **RF03.4**: O usuário deve poder visualizar lista de viagens
- **RF03.5**: O usuário deve poder visualizar detalhes da viagem
- **RF03.6**: O usuário deve poder definir orçamento
- **RF03.7**: O usuário deve poder adicionar imagem de capa
- **RF03.8**: O usuário deve poder alterar status da viagem

### RF04 - Viagens em Grupo
- **RF04.1**: O dono deve poder convidar pessoas por email
- **RF04.2**: O convidado deve receber notificação de convite
- **RF04.3**: O convidado deve poder aceitar ou recusar convite
- **RF04.4**: Membros devem poder visualizar a viagem
- **RF04.5**: Membros devem poder editar itinerário
- **RF04.6**: Membros devem poder adicionar despesas
- **RF04.7**: O dono deve poder remover membros
- **RF04.8**: Membros devem poder sair da viagem

### RF05 - Itinerário
- **RF05.1**: O usuário deve poder adicionar atividade ao itinerário
- **RF05.2**: O usuário deve poder editar atividade
- **RF05.3**: O usuário deve poder excluir atividade
- **RF05.4**: O usuário deve poder visualizar itinerário por data
- **RF05.5**: O usuário deve poder categorizar atividades
- **RF05.6**: O usuário deve poder definir horários
- **RF05.7**: O usuário deve poder adicionar localização

### RF06 - Controle Financeiro
- **RF06.1**: O usuário deve poder adicionar despesa
- **RF06.2**: O usuário deve poder editar despesa
- **RF06.3**: O usuário deve poder excluir despesa
- **RF06.4**: O usuário deve poder visualizar total de gastos
- **RF06.5**: O usuário deve poder visualizar gastos por categoria
- **RF06.6**: O usuário deve poder comparar gastos com orçamento
- **RF06.7**: O sistema deve alertar quando gastos ultrapassarem 80% do orçamento

### RF07 - Reservas
- **RF07.1**: O usuário deve poder adicionar reserva de voo
- **RF07.2**: O usuário deve poder adicionar reserva de hotel
- **RF07.3**: O usuário deve poder adicionar reserva de carro
- **RF07.4**: O usuário deve poder adicionar reserva de atividade
- **RF07.5**: O usuário deve poder editar reserva
- **RF07.6**: O usuário deve poder excluir reserva
- **RF07.7**: O usuário deve poder visualizar todas as reservas

### RF08 - Lugares e Mapas
- **RF08.1**: O usuário deve poder buscar lugares
- **RF08.2**: O usuário deve poder salvar lugares favoritos
- **RF08.3**: O usuário deve poder adicionar notas aos lugares
- **RF08.4**: O usuário deve poder marcar lugares como visitados
- **RF08.5**: O usuário deve poder visualizar lugares no mapa
- **RF08.6**: O usuário deve poder excluir lugares salvos

---

## 7. Requisitos Não Funcionais

### RNF01 - Performance
- **RNF01.1**: Tempo de carregamento inicial < 3 segundos
- **RNF01.2**: Tempo de resposta de operações < 1 segundo
- **RNF01.3**: Suporte a 1000 usuários simultâneos
- **RNF01.4**: Otimização de imagens automática
- **RNF01.5**: Lazy loading de componentes pesados

### RNF02 - Segurança
- **RNF02.1**: Comunicação via HTTPS
- **RNF02.2**: Senhas criptografadas (bcrypt)
- **RNF02.3**: Tokens JWT para autenticação
- **RNF02.4**: Row Level Security no banco de dados
- **RNF02.5**: Validação de dados no cliente e servidor
- **RNF02.6**: Proteção contra SQL Injection
- **RNF02.7**: Proteção contra XSS
- **RNF02.8**: Rate limiting em APIs

### RNF03 - Usabilidade
- **RNF03.1**: Interface responsiva (mobile, tablet, desktop)
- **RNF03.2**: Suporte a navegadores modernos (Chrome, Firefox, Safari, Edge)
- **RNF03.3**: Feedback visual para ações do usuário
- **RNF03.4**: Mensagens de erro claras
- **RNF03.5**: Acessibilidade WCAG 2.1 nível AA

### RNF04 - Confiabilidade
- **RNF04.1**: Disponibilidade de 99.9%
- **RNF04.2**: Backup automático diário
- **RNF04.3**: Recuperação de desastres < 4 horas
- **RNF04.4**: Tratamento de erros gracioso

### RNF05 - Manutenibilidade
- **RNF05.1**: Código TypeScript com tipagem forte
- **RNF05.2**: Componentes reutilizáveis
- **RNF05.3**: Documentação inline
- **RNF05.4**: Testes unitários e de integração
- **RNF05.5**: Logs estruturados

### RNF06 - Escalabilidade
- **RNF06.1**: Arquitetura serverless
- **RNF06.2**: CDN para assets estáticos
- **RNF06.3**: Database connection pooling
- **RNF06.4**: Caching de queries frequentes

---

## 8. Segurança

### 8.1 Row Level Security (RLS)

Todas as tabelas implementam RLS para garantir que usuários só acessem seus próprios dados.

#### Exemplo: Políticas de Trips

\`\`\`sql
-- Usuários podem ver apenas suas próprias viagens
CREATE POLICY "Users can view their own trips"
  ON trips FOR SELECT
  USING (auth.uid() = user_id);

-- Usuários podem criar viagens
CREATE POLICY "Users can create trips"
  ON trips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Usuários podem atualizar suas viagens
CREATE POLICY "Users can update their own trips"
  ON trips FOR UPDATE
  USING (auth.uid() = user_id);

-- Usuários podem deletar suas viagens
CREATE POLICY "Users can delete their own trips"
  ON trips FOR DELETE
  USING (auth.uid() = user_id);
\`\`\`

#### Políticas para Viagens em Grupo

\`\`\`sql
-- Membros podem ver viagens compartilhadas
CREATE POLICY "Members can view shared trips"
  ON trips FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_members.trip_id = trips.id
      AND trip_members.user_id = auth.uid()
    )
  );

-- Membros podem editar viagens compartilhadas
CREATE POLICY "Members can update shared trips"
  ON trips FOR UPDATE
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_members.trip_id = trips.id
      AND trip_members.user_id = auth.uid()
    )
  );
\`\`\`

### 8.2 Autenticação

- **JWT Tokens**: Tokens assinados com chave secreta
- **Refresh Tokens**: Renovação automática de sessão
- **Session Management**: Middleware verifica sessão em cada request
- **Email Verification**: Confirmação obrigatória de email

### 8.3 Validação de Dados

#### Client-Side (Zod)
\`\`\`typescript
const tripSchema = z.object({
  title: z.string().min(3, 'Título deve ter no mínimo 3 caracteres'),
  destination: z.string().min(3, 'Destino deve ter no mínimo 3 caracteres'),
  start_date: z.string().refine((date) => new Date(date) > new Date(), {
    message: 'Data de início deve ser futura'
  }),
  end_date: z.string(),
  budget: z.number().positive('Orçamento deve ser positivo').optional()
}).refine((data) => new Date(data.end_date) > new Date(data.start_date), {
  message: 'Data de término deve ser após data de início',
  path: ['end_date']
})
\`\`\`

#### Server-Side (PostgreSQL Constraints)
\`\`\`sql
ALTER TABLE trips
  ADD CONSTRAINT check_dates CHECK (end_date > start_date),
  ADD CONSTRAINT check_budget CHECK (budget > 0);
\`\`\`

### 8.4 Proteção de API Keys

- **Google Maps API**: Restrita por HTTP referrer e APIs específicas
- **Supabase Keys**: Anon key exposta, service role key apenas no servidor
- **Environment Variables**: Nunca commitadas no Git

---

## 9. Performance e Escalabilidade

### 9.1 Otimizações de Performance

#### Server-Side Rendering
\`\`\`typescript
// Página renderizada no servidor
export default async function TripsPage() {
  const supabase = await createClient()
  const { data: trips } = await supabase
    .from('trips')
    .select('*')
    .order('start_date', { ascending: false })
  
  return <TripsList trips={trips} />
}
\`\`\`

#### Static Generation
\`\`\`typescript
// Geração estática para páginas públicas
export const revalidate = 3600 // Revalidar a cada hora

export default async function LandingPage() {
  return <Hero />
}
\`\`\`

#### Image Optimization
\`\`\`typescript
import Image from 'next/image'

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority
  placeholder="blur"
/>
\`\`\`

#### Code Splitting
\`\`\`typescript
// Lazy loading de componentes pesados
const GoogleMap = dynamic(() => import('@/components/google-map'), {
  ssr: false,
  loading: () => <Skeleton />
})
\`\`\`

### 9.2 Caching

#### Browser Caching
\`\`\`typescript
// next.config.mjs
export default {
  async headers() {
    return [
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}
\`\`\`

#### SWR for Data Fetching
\`\`\`typescript
import useSWR from 'swr'

function useTrips() {
  const { data, error, mutate } = useSWR('/api/trips', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000 // 1 minuto
  })
  
  return {
    trips: data,
    isLoading: !error && !data,
    isError: error,
    mutate
  }
}
\`\`\`

### 9.3 Database Optimization

#### Índices
\`\`\`sql
-- Índices para queries frequentes
CREATE INDEX idx_trips_user_id ON trips(user_id);
CREATE INDEX idx_trips_start_date ON trips(start_date);
CREATE INDEX idx_itinerary_items_trip_date ON itinerary_items(trip_id, date);
\`\`\`

#### Connection Pooling
Supabase gerencia automaticamente o pool de conexões.

#### Query Optimization
\`\`\`typescript
// Buscar apenas campos necessários
const { data } = await supabase
  .from('trips')
  .select('id, title, destination, start_date, end_date')
  .eq('user_id', userId)

// Usar joins para reduzir queries
const { data } = await supabase
  .from('trips')
  .select(`
    *,
    itinerary_items(count),
    expenses(sum(amount))
  `)
\`\`\`

### 9.4 Escalabilidade

#### Horizontal Scaling
- **Vercel**: Auto-scaling de serverless functions
- **Supabase**: Database scaling automático
- **CDN**: Distribuição global de assets

#### Vertical Scaling
- **Database**: Upgrade de plano Supabase conforme necessário
- **Compute**: Aumento de recursos de serverless functions

#### Monitoring
\`\`\`typescript
// Vercel Analytics
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
\`\`\`

---

## 10. Deployment e CI/CD

### 10.1 Pipeline de Deployment

\`\`\`
┌─────────────┐
│   Git Push  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Vercel    │
│   Webhook   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Build     │
│   (Next.js) │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Tests     │
│   (Jest)    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Deploy    │
│   (Edge)    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Live      │
└─────────────┘
\`\`\`

### 10.2 Ambientes

- **Development**: `localhost:3000`
- **Preview**: `*.vercel.app` (para cada PR)
- **Production**: `viaja-plus.com`

### 10.3 Variáveis de Ambiente por Ambiente

\`\`\`bash
# Development
NEXT_PUBLIC_SUPABASE_URL=https://dev.supabase.co
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Preview
NEXT_PUBLIC_SUPABASE_URL=https://staging.supabase.co
NEXT_PUBLIC_SITE_URL=https://preview.vercel.app

# Production
NEXT_PUBLIC_SUPABASE_URL=https://prod.supabase.co
NEXT_PUBLIC_SITE_URL=https://viaja-plus.com
\`\`\`

---

## Conclusão

Esta documentação técnica fornece uma visão completa da arquitetura, implementação e operação do sistema Viaja+. Para mais informações, consulte:

- [README.md](./README.md) - Guia de instalação e execução
- [USER_MANUAL.md](./USER_MANUAL.md) - Manual do usuário
- [BUSINESS_MODEL.md](./BUSINESS_MODEL.md) - Modelo de negócio
- [CHANGELOG.md](./CHANGELOG.md) - Histórico de versões

---

**Última atualização**: Janeiro 2025  
**Versão**: 1.0.0
