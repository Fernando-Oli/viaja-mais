/**
 * Usuários de teste do seed, num lugar só. Quem os cria no banco é
 * `scripts/db/semear.mjs`, que lê esta constante.
 *
 * Os testes de RLS, de rota e os E2E importam daqui, em vez de repetir e-mail
 * e senha em cada arquivo: quando a política de senha mudou (13/11/2026), a
 * senha estava escrita em 46 arquivos. Agora é esta constante, e o seed a
 * importa daqui.
 *
 * A senha atende à política de produção (8+ caracteres, com minúscula,
 * maiúscula, número e símbolo — `lib/seguranca/senha.ts`), porque os testes
 * que **criam** conta também a usam, e o Auth recusa senha fraca no cadastro.
 */

export const SENHA_TESTE = "Viaja+mais123"

export const USUARIOS = {
  /** Ana — usuária A, dona das viagens nos testes. */
  ana: { id: "11111111-1111-4111-8111-111111111111", email: "teste.a@viajamais.local", senha: SENHA_TESTE, nome: "Ana Teste" },
  /** Bruno — usuário B, o que não deve ver o que é da Ana. */
  bruno: { id: "22222222-2222-4222-8222-222222222222", email: "teste.b@viajamais.local", senha: SENHA_TESTE, nome: "Bruno Teste" },
  /** Carla — terceira pessoa (RF09.3: quem não é parte de uma solicitação). */
  carla: { id: "33333333-3333-4333-8333-333333333333", email: "teste.c@viajamais.local", senha: SENHA_TESTE, nome: "Carla Teste" },
  /** Davi — reservado aos E2E de perfil. */
  davi: { id: "44444444-4444-4444-8444-444444444444", email: "teste.d@viajamais.local", senha: SENHA_TESTE, nome: "Davi Teste" },
} as const
