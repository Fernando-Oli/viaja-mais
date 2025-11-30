"use client";

import type React from "react";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Mail, Lock } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { user, profile, refreshUser } = useAuth();
  const { toast } = useToast();

  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  async function handleProfileUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsUpdatingProfile(true);

    try {
      const formData = new FormData(e.currentTarget);
      const response = await fetch("/api/profile/update", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao atualizar perfil");
      }

      toast({
        title: "Perfil atualizado",
        description: "Suas informações foram atualizadas com sucesso.",
      });

      // Refresh user data in context
      await refreshUser();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsChangingPassword(true);

    try {
      const formData = new FormData(e.currentTarget);
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao alterar senha");
      }

      toast({
        title: "Senha alterada",
        description: data.message || "Sua senha foi alterada com sucesso.",
      });

      // Reset form
      e.currentTarget.reset();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-viaja-navy">Configurações</h1>
        <p className="mt-2 text-gray-600">
          Gerencie suas informações pessoais e preferências
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-viaja-orange" />
              Informações Pessoais
            </CardTitle>
            <CardDescription>Atualize seus dados pessoais</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nome Completo</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  defaultValue={profile?.full_name || ""}
                  placeholder="Seu nome completo"
                  required
                  disabled={isUpdatingProfile}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avatar_url">URL do Avatar</Label>
                <Input
                  id="avatar_url"
                  name="avatar_url"
                  defaultValue={profile?.avatar_url || ""}
                  placeholder="https://exemplo.com/avatar.jpg"
                  disabled={isUpdatingProfile}
                />
              </div>
              <Button
                type="submit"
                className="bg-viaja-orange hover:bg-viaja-orange/90"
                disabled={isUpdatingProfile}
              >
                {isUpdatingProfile ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-viaja-orange" />
              Conta
            </CardTitle>
            <CardDescription>Informações da sua conta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={user?.email || ""}
                disabled
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500">
                O email não pode ser alterado
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-viaja-orange" />
              Segurança
            </CardTitle>
            <CardDescription>Altere sua senha</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current_password">Senha Atual</Label>
                <Input
                  id="current_password"
                  name="current_password"
                  type="password"
                  required
                  disabled={isChangingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_password">Nova Senha</Label>
                <Input
                  id="new_password"
                  name="new_password"
                  type="password"
                  required
                  minLength={6}
                  disabled={isChangingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirmar Nova Senha</Label>
                <Input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  required
                  minLength={6}
                  disabled={isChangingPassword}
                />
              </div>
              <Button
                type="submit"
                className="bg-viaja-orange hover:bg-viaja-orange/90"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? "Alterando..." : "Alterar Senha"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
