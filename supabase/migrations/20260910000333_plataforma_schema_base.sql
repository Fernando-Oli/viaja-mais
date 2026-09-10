


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_trip_owner_as_member"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.user_id, 'owner');
  return new;
end;
$$;


ALTER FUNCTION "public"."add_trip_owner_as_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_trip"("trip_uuid" "uuid", "user_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT public.is_trip_owner(trip_uuid, user_uuid) 
    OR public.is_trip_member(trip_uuid, user_uuid);
$$;


ALTER FUNCTION "public"."can_access_trip"("trip_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_email"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    auth.jwt()->>'email',
    (auth.jwt()->'user_metadata'->>'email')
  );
$$;


ALTER FUNCTION "public"."get_current_user_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trip_member"("trip_uuid" "uuid", "user_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = trip_uuid
    AND user_id = user_uuid
  );
$$;


ALTER FUNCTION "public"."is_trip_member"("trip_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trip_owner"("trip_uuid" "uuid", "user_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips
    WHERE id = trip_uuid
    AND user_id = user_uuid
  );
$$;


ALTER FUNCTION "public"."is_trip_owner"("trip_uuid" "uuid", "user_uuid" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "confirmation_number" "text",
    "provider" "text",
    "start_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone,
    "location" "text",
    "price" numeric(10,2),
    "currency" "text" DEFAULT 'BRL'::"text",
    "status" "text" DEFAULT 'confirmed'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "bookings_type_check" CHECK (("type" = ANY (ARRAY['flight'::"text", 'hotel'::"text", 'car'::"text", 'activity'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text",
    "category" "text" NOT NULL,
    "date" "date" NOT NULL,
    "payment_method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "expenses_category_check" CHECK (("category" = ANY (ARRAY['accommodation'::"text", 'transport'::"text", 'food'::"text", 'activities'::"text", 'shopping'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itinerary_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "date" "date" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "location" "text",
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "category" "text",
    "status" "text" DEFAULT 'planned'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "itinerary_items_category_check" CHECK (("category" = ANY (ARRAY['accommodation'::"text", 'transport'::"text", 'activity'::"text", 'restaurant'::"text", 'attraction'::"text", 'other'::"text"]))),
    CONSTRAINT "itinerary_items_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."itinerary_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."places" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "latitude" numeric(10,8) NOT NULL,
    "longitude" numeric(11,8) NOT NULL,
    "place_id" "text",
    "category" "text",
    "rating" numeric(2,1),
    "notes" "text",
    "visited" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."places" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_invitations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "inviter_id" "uuid" NOT NULL,
    "invitee_email" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "invitee_id" "uuid",
    CONSTRAINT "trip_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."trip_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "joined_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "trip_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."trip_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "destination" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "description" "text",
    "budget" numeric(10,2),
    "currency" "text" DEFAULT 'BRL'::"text",
    "cover_image" "text",
    "status" "text" DEFAULT 'planning'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "trips_status_check" CHECK (("status" = ANY (ARRAY['planning'::"text", 'confirmed'::"text", 'ongoing'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_invitations"
    ADD CONSTRAINT "trip_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_trip_id_user_id_key" UNIQUE ("trip_id", "user_id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



CREATE OR REPLACE TRIGGER "on_trip_created" AFTER INSERT ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."add_trip_owner_as_member"();



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invitations"
    ADD CONSTRAINT "trip_invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invitations"
    ADD CONSTRAINT "trip_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invitations"
    ADD CONSTRAINT "trip_invitations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated users to read trips" ON "public"."trips" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Trip owners and members can create itinerary items" ON "public"."itinerary_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "itinerary_items"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Trip owners and members can delete itinerary items" ON "public"."itinerary_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "itinerary_items"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Trip owners and members can update itinerary items" ON "public"."itinerary_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "itinerary_items"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Trip owners and members can update trips" ON "public"."trips" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."trip_members"
  WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Trip owners can delete their trips" ON "public"."trips" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Trip owners can update their trips" ON "public"."trips" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create itinerary items" ON "public"."itinerary_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "itinerary_items"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can create trip bookings" ON "public"."bookings" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "bookings"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"()))))))))));



CREATE POLICY "Users can create trip expenses" ON "public"."expenses" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "expenses"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"()))))))))));



CREATE POLICY "Users can create trip places" ON "public"."places" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "places"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"()))))))))));



CREATE POLICY "Users can delete itinerary items" ON "public"."itinerary_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "itinerary_items"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can delete trip bookings" ON "public"."bookings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "bookings"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can delete trip expenses" ON "public"."expenses" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "expenses"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can delete trip places" ON "public"."places" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "places"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own trips" ON "public"."trips" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update itinerary items" ON "public"."itinerary_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "itinerary_items"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update trip bookings" ON "public"."bookings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "bookings"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can update trip expenses" ON "public"."expenses" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "expenses"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can update trip places" ON "public"."places" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "places"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can view itinerary items" ON "public"."itinerary_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "itinerary_items"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own trips or trips they are members of" ON "public"."trips" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."trip_members"
  WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view trip bookings" ON "public"."bookings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "bookings"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can view trip expenses" ON "public"."expenses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "expenses"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can view trip places" ON "public"."places" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "places"."trip_id") AND (("trips"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."trip_members"
          WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can view trips where they are members" ON "public"."trips" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trip_members"
  WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_delete" ON "public"."bookings" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "bookings_insert" ON "public"."bookings" FOR INSERT WITH CHECK (("public"."can_access_trip"("trip_id", "auth"."uid"()) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "bookings_select" ON "public"."bookings" FOR SELECT USING ("public"."can_access_trip"("trip_id", "auth"."uid"()));



CREATE POLICY "bookings_update" ON "public"."bookings" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_delete" ON "public"."expenses" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "expenses_insert" ON "public"."expenses" FOR INSERT WITH CHECK (("public"."can_access_trip"("trip_id", "auth"."uid"()) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "expenses_select" ON "public"."expenses" FOR SELECT USING ("public"."can_access_trip"("trip_id", "auth"."uid"()));



CREATE POLICY "expenses_update" ON "public"."expenses" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."itinerary_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "itinerary_items_delete" ON "public"."itinerary_items" FOR DELETE USING ("public"."can_access_trip"("trip_id", "auth"."uid"()));



CREATE POLICY "itinerary_items_insert" ON "public"."itinerary_items" FOR INSERT WITH CHECK ("public"."can_access_trip"("trip_id", "auth"."uid"()));



CREATE POLICY "itinerary_items_select" ON "public"."itinerary_items" FOR SELECT USING ("public"."can_access_trip"("trip_id", "auth"."uid"()));



CREATE POLICY "itinerary_items_update" ON "public"."itinerary_items" FOR UPDATE USING ("public"."can_access_trip"("trip_id", "auth"."uid"()));



ALTER TABLE "public"."places" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "places_delete" ON "public"."places" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "places_insert" ON "public"."places" FOR INSERT WITH CHECK (("public"."can_access_trip"("trip_id", "auth"."uid"()) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "places_select" ON "public"."places" FOR SELECT USING ("public"."can_access_trip"("trip_id", "auth"."uid"()));



CREATE POLICY "places_update" ON "public"."places" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_invitations_delete" ON "public"."trip_invitations" FOR DELETE USING ((("invitee_email" = ("auth"."jwt"() ->> 'email'::"text")) OR "public"."is_trip_owner"("trip_id", "auth"."uid"())));



CREATE POLICY "trip_invitations_insert" ON "public"."trip_invitations" FOR INSERT WITH CHECK ("public"."is_trip_owner"("trip_id", "auth"."uid"()));



CREATE POLICY "trip_invitations_select" ON "public"."trip_invitations" FOR SELECT USING ((("invitee_email" = ("auth"."jwt"() ->> 'email'::"text")) OR ("inviter_id" = "auth"."uid"()) OR "public"."is_trip_owner"("trip_id", "auth"."uid"())));



CREATE POLICY "trip_invitations_update" ON "public"."trip_invitations" FOR UPDATE USING ((("invitee_email" = ("auth"."jwt"() ->> 'email'::"text")) OR "public"."is_trip_owner"("trip_id", "auth"."uid"())));



ALTER TABLE "public"."trip_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_members_delete" ON "public"."trip_members" FOR DELETE USING (("public"."is_trip_owner"("trip_id", "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "trip_members_insert" ON "public"."trip_members" FOR INSERT WITH CHECK (("public"."is_trip_owner"("trip_id", "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "trip_members_select" ON "public"."trip_members" FOR SELECT USING ("public"."can_access_trip"("trip_id", "auth"."uid"()));



CREATE POLICY "trip_members_update" ON "public"."trip_members" FOR UPDATE USING (("public"."is_trip_owner"("trip_id", "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trips_delete_owner" ON "public"."trips" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "trips_insert" ON "public"."trips" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trips_select_member" ON "public"."trips" FOR SELECT USING ("public"."is_trip_member"("id", "auth"."uid"()));



CREATE POLICY "trips_select_owner" ON "public"."trips" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "trips_update_owner" ON "public"."trips" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users can insert their own trips" ON "public"."trips" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."add_trip_owner_as_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_trip_owner_as_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_trip_owner_as_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_trip"("trip_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_trip"("trip_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_trip"("trip_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_trip_member"("trip_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trip_member"("trip_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trip_member"("trip_uuid" "uuid", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_trip_owner"("trip_uuid" "uuid", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trip_owner"("trip_uuid" "uuid", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trip_owner"("trip_uuid" "uuid", "user_uuid" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."itinerary_items" TO "anon";
GRANT ALL ON TABLE "public"."itinerary_items" TO "authenticated";
GRANT ALL ON TABLE "public"."itinerary_items" TO "service_role";



GRANT ALL ON TABLE "public"."places" TO "anon";
GRANT ALL ON TABLE "public"."places" TO "authenticated";
GRANT ALL ON TABLE "public"."places" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."trip_invitations" TO "anon";
GRANT ALL ON TABLE "public"."trip_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."trip_members" TO "anon";
GRANT ALL ON TABLE "public"."trip_members" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_members" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


