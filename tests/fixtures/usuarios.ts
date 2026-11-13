/**
 * Usuários de teste do seed (`supabase/seed.sql`), num lugar só.
 *
 * Os testes de RLS, de rota e os E2E importam daqui, em vez de repetir e-mail
 * e senha em cada arquivo: quando a política de senha mudou (13/11/2026), a
 * senha estava escrita em 46 arquivos. Agora é esta constante — e o seed, que
 * é SQL e não importa nada (mantenha os dois iguais).
 *
 * A senha atende à política de produção (8+ caracteres, com minúscula,
 * maiúscula, número e símbolo — `lib/seguranca/senha.ts`), porque os testes
 * que **criam** conta também a usam, e o Auth recusa senha fraca no cadastro.
 */

export const SENHA_TESTE = "Viaja+mais123"

export const USUARIOS = {
  /** Ana — usuária A, dona das viagens nos testes. */
  ana: { email: "teste.a@viajamais.local", senha: SENHA_TESTE, nome: "Ana Teste" },
  /** Bruno — usuário B, o que não deve ver o que é da Ana. */
  bruno: { email: "teste.b@viajamais.local", senha: SENHA_TESTE, nome: "Bruno Teste" },
  /** Carla — terceira pessoa (RF09.3: quem não é parte de uma solicitação). */
  carla: { email: "teste.c@viajamais.local", senha: SENHA_TESTE, nome: "Carla Teste" },
  /** Davi — reservado aos E2E de perfil. */
  davi: { email: "teste.d@viajamais.local", senha: SENHA_TESTE, nome: "Davi Teste" },
} as const
