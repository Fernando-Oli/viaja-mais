"use client";

import type React from "react";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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
  user: User | null;
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
  addTrip: (trip: TripCreate) => void;
  updateTrip: (trip: Trip) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tripsLoading, setTripsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        await fetchProfile(user.id);
      } else {
        setProfile(null);
        setTrips([]);
        setInvitations([]);
      }
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
  const addTrip = async (trip: TripCreate) => {
    try {
      const res = await fetch(`/api/trips`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(trip),
      });

      console.log(res);

      if (!res.ok) {
        const err = await res.json();
        console.error("Erro da API:", err);
        return;
      }

      const { data } = await res.json();
      // Atualiza estado com o trip criado no backend (garante id, user_id etc)
      setTrips((prev) => [data[0], ...prev]);
    } catch (error) {
      console.error("Erro on create trip", error);
    }
  };

  // <CHANGE> Added updateTrip function to update local state without refetching
  const updateTrip = (updatedTrip: Trip) => {
    setTrips((prev) =>
      prev.map((trip) => (trip.id === updatedTrip.id ? updatedTrip : trip))
    );
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setTrips([]);
        setInvitations([]);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // <CHANGE> Fetch trips and invitations when user is authenticated
  useEffect(() => {
    if (user) {
      fetchTrips();
      fetchInvitations();
    }
  }, [user, fetchTrips, fetchInvitations]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
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
