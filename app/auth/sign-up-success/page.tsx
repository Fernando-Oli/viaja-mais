import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Mail, Plane } from "lucide-react";

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-linear-to-br from-sky-50 via-white to-amber-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-10 h-10 bg-viaja-green rounded-xl flex items-center justify-center relative">
              <Plane
                className="w-5 h-5 text-white absolute"
                style={{ transform: "rotate(-45deg)" }}
              />
            </div>
            <span className="text-2xl font-bold text-viaja-navy">Viaja+</span>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Mail className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Verifique seu email</CardTitle>
            <CardDescription>
              Enviamos um link de confirmação para o seu email. Por favor,
              clique no link para ativar sua conta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-sky-50 p-4 text-sm text-sky-800">
              <p className="font-medium mb-1">Não recebeu o email?</p>
              <p>Verifique sua caixa de spam ou aguarde alguns minutos.</p>
            </div>
            <Button asChild className="w-full">
              <Link href="/auth/login">Voltar para o login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
