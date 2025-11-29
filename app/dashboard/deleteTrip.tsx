import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function deleteTrip(tripId: string) {
    const supabase = await createClient()
    const { error } = await supabase.from("trips").delete().eq("id", tripId)
    if (error) throw error
    redirect("/dashboard")
  }