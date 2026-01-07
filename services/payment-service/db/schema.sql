\restrict yJP6WMhiu758SIs6XUJpoApGNnbdmlXttBkp7NCfc3YiZUdPqJsBLqloWHyDeFg

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aggregate_type character varying(255) NOT NULL,
    aggregate_id character varying(255) NOT NULL,
    event_type character varying(255) NOT NULL,
    payload jsonb NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    status text NOT NULL,
    provider text NOT NULL,
    idempotency_key text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: outbox outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox
    ADD CONSTRAINT outbox_pkey PRIMARY KEY (id);


--
-- Name: payments payments_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: idx_outbox_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_created_at ON public.outbox USING btree (created_at);


--
-- Name: idx_payments_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_order_id ON public.payments USING btree (order_id);


--
-- Name: idx_payments_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_user_id ON public.payments USING btree (user_id);


--
-- Name: dbz_publication; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION dbz_publication FOR ALL TABLES WITH (publish = 'insert, update, delete, truncate');


--
-- PostgreSQL database dump complete
--

\unrestrict yJP6WMhiu758SIs6XUJpoApGNnbdmlXttBkp7NCfc3YiZUdPqJsBLqloWHyDeFg


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('001'),
    ('002');
