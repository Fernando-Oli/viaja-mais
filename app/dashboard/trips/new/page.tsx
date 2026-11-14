"use client";

import type React from "react";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { Textarea } from "@/components/ui/textarea";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { useToast } from "@/hooks/use-toast";

export default function NewTripPage() {
  const router = useRouter();
  const { addTrip } = useAuth();
  const { toast } = useToast();
  const [loading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    destination: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    description: "",
    budget: 0,
    currency: "BRL",
    status: "planning",
  });

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const viagem = await addTrip({
        ...formData,
      });

      toast({ title: "Viagem criada", description: "Agora convide quem vai com você." });
      // Direto para o detalhe: é lá que fica o convite, o próximo passo do grupo.
      router.push(`/dashboard/trips/${viagem.id}`);
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Erro ao criar viagem";
      setError(mensagem);
      toast({ title: "Erro", description: mensagem, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/trips/criar"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Nova viagem
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Criar do meu jeito</h1>
        <p className="mt-1 text-muted-foreground">
          Comece pelo essencial. Roteiro, reservas e despesas você adiciona depois.
        </p>
      </div>

      <Link
        href="/dashboard/trips/criar/ia"
        className="flex items-center gap-3 rounded-2xl bg-citrico px-4 py-3.5 text-grafite transition-colors hover:bg-citrico/90"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-citrico">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <span className="flex-1 text-sm">
          <strong className="font-semibold">Prefere responder perguntas?</strong> A Avori monta o roteiro para você.
        </span>
        <ChevronRight className="h-5 w-5" aria-hidden />
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Informações da Viagem</CardTitle>
          <CardDescription>
            Adicione os detalhes básicos da sua viagem
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Título da Viagem *</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Ex: Férias em Paris"
                  required
                  value={formData.title}
                  onChange={(e) => handleInputChange(e)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">Destino *</Label>
                <PlaceAutocomplete
                  id="destination"
                  required
                  handleInputChangeAutocomplete={handleInputChange}
                  query={formData.destination}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_date">Data de Início *</Label>
                <Input
                  id="start_date"
                  type="date"
                  name="start_date"
                  required
                  min={new Date().toISOString().split("T")[0]}
                  value={formData.start_date}
                  onChange={(e) => handleInputChange(e)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">Data de Término *</Label>
                <Input
                  id="end_date"
                  type="date"
                  name="end_date"
                  min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
                  required
                  value={formData.end_date}
                  onChange={(e) => handleInputChange(e)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">Orçamento</Label>
                <Input
                  id="number"
                  type="text"
                  name="budget"
                  value={Number(formData.budget)}
                  onChange={(e) => handleInputChange(e)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Moeda</Label>
                <Select
                  value={formData.currency}
                  name="currency"
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, currency: value }))
                  }
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL - Real Brasileiro</SelectItem>
                    <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - Libra Esterlina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Adicione uma descrição sobre sua viagem..."
                rows={4}
                value={formData.description}
                onChange={(e) => handleInputChange(e)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                name="status"
                value={formData.status}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, status: value }))
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planejando</SelectItem>
                  <SelectItem value="confirmed">Confirmada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? "Criando..." : "Criar Viagem"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/trips">Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
