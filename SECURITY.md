# Guia de Segurança - Viaja+

## Google Maps API Key

### ⚠️ Aviso Importante sobre NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

Você pode ver avisos do sistema sobre a exposição da variável `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` no código client-side. **Isso é esperado e correto**.

### Por que a API Key está exposta?

O Google Maps JavaScript API **deve** rodar no navegador (client-side), portanto a chave precisa estar acessível ao código do cliente. Esta é a implementação oficial e recomendada pelo Google.

### Como garantir a segurança?

A segurança da sua API key do Google Maps é garantida através de **restrições configuradas no Google Cloud Console**, não escondendo a chave.

#### Passo 1: Configurar Restrições de HTTP Referrer

1. Acesse: https://console.cloud.google.com/apis/credentials
2. Clique na sua API key para editá-la
3. Em **"Application restrictions"**, selecione **"HTTP referrers (web sites)"**
4. Adicione seus domínios autorizados:
   \`\`\`
   localhost:3000/*
   *.vercel.app/*
   seu-dominio.com/*
   \`\`\`

#### Passo 2: Restringir APIs

1. Na mesma página de configuração da API key
2. Em **"API restrictions"**, selecione **"Restrict key"**
3. Marque apenas as APIs necessárias:
   - ✅ Maps JavaScript API
   - ✅ Places API
   - ✅ Geocoding API (opcional)

#### Passo 3: Configurar Quotas

1. Acesse: https://console.cloud.google.com/apis/dashboard
2. Configure limites diários para cada API
3. Configure alertas de uso

### Por que isso é seguro?

1. **Restrições de Domínio**: Mesmo que alguém veja sua chave, ela só funcionará nos domínios que você autorizou
2. **Restrições de API**: A chave só pode acessar as APIs específicas que você habilitou
3. **Quotas**: Limites de uso previnem abuso
4. **Monitoramento**: Você pode ver todo o uso no Google Cloud Console

### Referências Oficiais

- [Google Maps API Security Best Practices](https://developers.google.com/maps/api-security-best-practices)
- [API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)
- [Restricting API Keys](https://cloud.google.com/docs/authentication/api-keys#api_key_restrictions)

## Outras Medidas de Segurança

### Supabase

- **Row Level Security (RLS)**: Habilitado em todas as tabelas
- **Políticas de Acesso**: Usuários só acessam seus próprios dados
- **Service Role Key**: Nunca exposta ao cliente, apenas no servidor

### Autenticação

- **JWT Tokens**: Tokens assinados com chave secreta
- **Refresh Tokens**: Renovação automática de sessão
- **Email Verification**: Confirmação obrigatória de email
- **Password Hashing**: Senhas criptografadas com bcrypt

### Comunicação

- **HTTPS**: Toda comunicação é criptografada
- **Secure Cookies**: Cookies com flags httpOnly e secure
- **CORS**: Configurado para aceitar apenas origens autorizadas

### Validação de Dados

- **Client-Side**: Validação com Zod
- **Server-Side**: Validação no banco de dados com constraints
- **Sanitização**: Inputs sanitizados para prevenir XSS e SQL Injection

## Checklist de Segurança

Antes de fazer deploy em produção:

- [ ] Configurar restrições de HTTP Referrer no Google Cloud Console
- [ ] Configurar restrições de API no Google Cloud Console
- [ ] Configurar quotas e alertas de uso
- [ ] Verificar que todas as variáveis de ambiente estão configuradas
- [ ] Verificar que RLS está habilitado em todas as tabelas do Supabase
- [ ] Testar políticas de acesso do Supabase
- [ ] Configurar HTTPS no domínio de produção
- [ ] Configurar CORS adequadamente
- [ ] Revisar logs de segurança

## Reportar Vulnerabilidades

Se você encontrar uma vulnerabilidade de segurança, por favor reporte para:

📧 **Email**: security@viajaplus.com

**Não** abra issues públicas para vulnerabilidades de segurança.

---

**Última atualização**: Janeiro 2025
