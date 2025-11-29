declare module "*.css";

declare global {
  interface Window {
    google: any
  }
  interface Trip {
    id: string
    title: string
    destination: string
    start_date: string
    end_date: string
    status: string
    budget: number
    currency: string
    user_id: string
  }
  
  interface Invitation {
    id: string
    trip_id: string
    status: string
    created_at: string
    trip: {
      id: string
      title: string
      destination: string
      start_date: string
      end_date: string
    }
    profiles: {
      full_name: string
    }
  }
}

export {}
