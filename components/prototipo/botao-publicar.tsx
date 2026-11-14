"use client"

import { useState } from "react"
import { Lock, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { CapaViagem } from "@/components/brand/capa-viagem"
import { SeloPrevia } from "@/components/prototipo/selo-previa"
import { useToast } from "@/hooks/use-toast"

/**
 * PRÉVIA VISUAL de "Publicar viagem" (S06-M-publicar-viagem, do Micael, ainda
 * fora da main). O diálogo tem o visual final; "Publicar" não grava nada.
 */
const OPCOES = [
  { id: "roteiro", rotulo: "Roteiro dia a dia", ligado: true },
  { id: "lugares", rotulo: "Lugares salvos", ligado: true },
  { id: "grupo", rotulo: "Quem viajou com você", ligado: false },
]

export function BotaoPublicar({ viagemId, titulo, datas }: { viagemId: string; titulo: string; datas: string }) {
  const [aberto, setAberto] = useState(false)
  const [legenda, setLegenda] = useState("")
  const { toast } = useToast()
  return (
    <>
      <Button
        type="button"
        onClick={() => setAberto(true)}
        className="h-10 rounded-xl bg-citrico px-4 text-grafite hover:bg-citrico/90"
      >
        <Share2 className="h-4 w-4" aria-hidden />
        Publicar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Publicar viagem</DialogTitle>
            <DialogDescription>Aparece no feed de quem segue você.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5 sm:flex-row">
            <CapaViagem semente={viagemId} className="h-56 shrink-0 rounded-2xl text-primary-foreground sm:h-auto sm:w-52">
              <div className="absolute inset-x-0 bottom-0 bg-primary px-3.5 py-3">
                <div className="text-xl font-semibold leading-tight">{titulo}</div>
                <div className="text-xs font-medium">{datas}</div>
              </div>
            </CapaViagem>
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label htmlFor="legenda">Legenda</Label>
                  <span className="text-xs font-medium text-muted-foreground">{legenda.length} de 280</span>
                </div>
                <Textarea
                  id="legenda"
                  maxLength={280}
                  value={legenda}
                  onChange={(e) => setLegenda(e.target.value)}
                  placeholder="Conte em uma frase como foi."
                  className="min-h-24 rounded-xl"
                />
              </div>
              <fieldset className="divide-y divide-border">
                <legend className="mb-1 text-sm font-semibold">O que aparece na publicação</legend>
                {OPCOES.map((o) => (
                  <div key={o.id} className="flex items-center justify-between py-2.5">
                    <Label htmlFor={`pub-${o.id}`} className="font-medium">
                      {o.rotulo}
                    </Label>
                    <Switch id={`pub-${o.id}`} defaultChecked={o.ligado} />
                  </div>
                ))}
              </fieldset>
              <p className="flex gap-2 text-xs font-medium text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
                Despesas, reservas e códigos de confirmação nunca são publicados.
              </p>
            </div>
          </div>
          <DialogFooter className="items-center gap-3 sm:justify-between">
            <SeloPrevia>Prévia: ainda não publica</SeloPrevia>
            <div className="flex gap-3">
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button
                className="h-11 rounded-xl bg-citrico px-6 text-grafite hover:bg-citrico/90"
                onClick={() => {
                  setAberto(false)
                  toast({ title: "Publicar ainda não está ligado", description: "Esta tela é uma prévia do visual." })
                }}
              >
                Publicar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
