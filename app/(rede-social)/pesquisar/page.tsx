import { Suspense } from "react";
import { Pesquisa } from "./pesquisa";

/**
 * /pesquisar: a tela de pesquisa da aba Rede social (S05-M-pesquisa).
 *
 * A tela lê o termo do endereço (?q=) com `useSearchParams`, que no build de
 * produção precisa de um limite de `Suspense` acima dele
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md).
 *
 * @RF09.10 buscar pessoas · @RF09.12 histórico de pesquisa
 */
export default function PesquisarPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="text-sm text-gray-500">
          Carregando...
        </p>
      }
    >
      <Pesquisa />
    </Suspense>
  );
}
