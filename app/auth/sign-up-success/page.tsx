import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Mail } from "lucide-react";

export default function SignUpSuccessPage() {
  return (
    <div className="w-full">
        <Card className="rounded-3xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Mail className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-3xl tracking-tight">Verifique seu email</CardTitle>
            <CardDescription>
              Enviamos um link de confirmação para o seu email. Por favor,
              clique no link para ativar sua conta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-sm text-foreground">
              <p className="font-medium mb-1">Mesmo sem a confirmação você já pode acessar sua conta normalmente, mas sua validade será temporária.</p>
            </div>
            <Button asChild className="w-full">
              <Link href="/auth/login">Voltar para o login</Link>
            </Button>
          </CardContent>
        </Card>
    </div>
  );
}
