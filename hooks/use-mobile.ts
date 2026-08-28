import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const CONSULTA = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function assinar(aoMudar: () => void) {
  const mql = window.matchMedia(CONSULTA)
  mql.addEventListener('change', aoMudar)
  return () => mql.removeEventListener('change', aoMudar)
}

const lerCliente = () => window.matchMedia(CONSULTA).matches
// No servidor não há viewport; assumimos desktop e o cliente corrige na hidratação.
const lerServidor = () => false

/**
 * useSyncExternalStore em vez de useState + useEffect: evita o setState síncrono
 * dentro do efeito (que dispara render em cascata) e dá um valor coerente já na
 * primeira renderização do cliente.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(assinar, lerCliente, lerServidor)
}
