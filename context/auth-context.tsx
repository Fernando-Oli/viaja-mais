"use client";

import type React from "react";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { authCliente } from "@/lib/auth-cliente";

/**
 * Sessão, perfil, viagens e convites do usuário, para todas as telas do painel.
 *
 * A sessão vem do Better Auth (`authCliente.useSession`), que pergunta à API em
 * `/api/auth/get-session`. O cookie é httpOnly: o navegador não lê o token, só
 * recebe de volta quem é o usuário. Até S13 isto lia a sessão pelo Supabase, e
 * sem ele o painel ficava parado em "Carregando...".
 *
 * Só `id` e `email` saem daqui: é o que as telas usam, e o tipo próprio evita
 * que alguma volte a depender do formato do `User` do Supabase.
 *
 * @RF01.3 autenticação com e-mail e senha · @RF01.4 encerrar a sessão
 */
export interface Usuario {
  id: string;
  email: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripCreate {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  status: string;
  budget: number;
  currency: string;
  description?: string;
}

// <CHANGE> Expanded context type with trips and invitations
interface AuthContextType {
  user: Usuario | null;
  profile: Profile | null;
  trips: Trip[];
  invitations: Invitation[];
  loading: boolean;
  tripsLoading: boolean;
  setTripsLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshTrips: () => Promise<void>;
  refreshInvitations: () => Promise<void>;
  deleteTrip: (tripId: string) => Promise<boolean>;
  addTrip: (trip: TripCreate) => Promise<Trip>;
  updateTrip: (trip: Trip) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: sessao, isPending, refetch } = authCliente.useSession();
  const userId = sessao?.user.id;
  const userEmail = sessao?.user.email;
  // Memorizado por id e e-mail: `useSession` devolve objeto novo a cada
  // renovação, e `user` novo dispararia de novo a busca de viagens e convites.
  const user = useMemo<Usuario | null>(
    () => (userId && userEmail ? { id: userId, email: userEmail } : null),
    [userId, userEmail],
  );
  const loading = isPending;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const router = useRouter();

  const fetchProfile = async (userId: string) => {
    try {

      if (!userId || userId === "undefined") {
        console.error("[v0] fetchProfile - Invalid userId:", userId)
        return
      }

      const url = `/api/profile/${userId}`

      const response = await fetch(url)

      if (response.ok) {
        const data = await response.json()
        setProfile(data.profile)
      } else {
        const errorData = await response.json()
        console.error("[v0] fetchProfile - Error response:", errorData)
      }
    } catch (error) {
      console.error("[v0] fetchProfile - Error:", error)
    }
  }

  // <CHANGE> Added fetchTrips function to cache trips in context
  const fetchTrips = useCallback(async () => {
    if (!user) return;
    setTripsLoading(true);
    try {
      const response = await fetch("/api/trips");
      if (response.ok) {
        const data = await response.json();
        setTrips(data.trips || []);
      }
    } catch (error) {
      console.error("Error fetching trips:", error);
    } finally {
      setTripsLoading(false);
    }
  }, [user]);

  // <CHANGE> Added fetchInvitations function to cache invitations in context
  const fetchInvitations = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/invitations");
      if (response.ok) {
        const data = await response.json();
        setInvitations(data.invitations);
      }
      
    } catch (error) {
      console.error("Error fetching invitations:", error);
    }
  }, [user]);

  const refreshUser = async () => {
    try {
      await refetch();
      if (user) await fetchProfile(user.id);
    } catch (error) {
      console.error("Error refreshing user:", error);
    }
  };

  // <CHANGE> Added deleteTrip function to context for centralized state management
  const deleteTrip = async (tripId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setTrips((prev) => prev.filter((trip) => trip.id !== tripId));
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error deleting trip:", error);
      return false;
    }
  };

  // <CHANGE> Added addTrip function to update local state without refetching
  // Lança em vez de engolir o erro: antes a tela de nova viagem seguia para o
  // dashboard como se tivesse gravado, e o usuário só via que não gravou depois.
  const addTrip = async (trip: TripCreate): Promise<Trip> => {
    const res = await fetch(`/api/trips`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(trip),
    });

    const corpo: { data?: Trip[]; error?: string } = await res.json().catch(() => ({}));
    if (!res.ok || !corpo.data?.[0]) {
      throw new Error(corpo.error || "Erro ao criar viagem");
    }

    const criada = corpo.data[0];
    // Atualiza estado com o trip criado no backend (garante id, user_id etc)
    setTrips((prev) => [criada, ...prev]);
    return criada;
  };

  // <CHANGE> Added updateTrip function to update local state without refetching
  const updateTrip = (updatedTrip: Trip) => {
    setTrips((prev) =>
      prev.map((trip) => (trip.id === updatedTrip.id ? updatedTrip : trip))
    );
  };

  // Entrou, saiu ou trocou de conta: o perfil acompanha a sessão.
  useEffect(() => {
    if (userId) {
      fetchProfile(userId);
    } else {
      setProfile(null);
      setTrips([]);
      setInvitations([]);
    }
  }, [userId]);

  // <CHANGE> Fetch trips and invitations when user is authenticated
  useEffect(() => {
    if (user) {
      fetchTrips();
      fetchInvitations();
    }
  }, [user, fetchTrips, fetchInvitations]);

  const signOut = async () => {
    // Apaga a sessão no banco, não só o cookie: o token deixa de valer em
    // qualquer réplica na hora.
    await authCliente.signOut();
    setProfile(null);
    setTrips([]);
    setInvitations([]);
    router.push("/");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        trips,
        invitations,
        loading,
        tripsLoading,
        setTripsLoading,
        signOut,
        refreshUser,
        refreshTrips: fetchTrips,
        refreshInvitations: fetchInvitations,
        deleteTrip,
        addTrip,
        updateTrip,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
