\restrict dbmate

-- Dumped from database version 16.12
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
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    total_amount numeric NOT NULL,
    status text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    idempotency_key text,
    cancellable_until timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    cancel_idempotency_key uuid,
    cancelled_at timestamp with time zone
);


--
-- Name: COLUMN orders.cancel_idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.cancel_idempotency_key IS 'Stored idempotency key for the cancellation/refund saga';


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
    processed_at timestamp with time zone,
    traceparent text,
    tracestate text
);


--
-- Name: processed_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_events (
    event_id character varying(255) NOT NULL,
    event_type character varying(100) NOT NULL,
    processed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: orders orders_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: outbox outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox
    ADD CONSTRAINT outbox_pkey PRIMARY KEY (id);


--
-- Name: processed_events processed_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_events
    ADD CONSTRAINT processed_events_pkey PRIMARY KEY (event_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: idx_orders_cancel_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_orders_cancel_idempotency_key ON public.orders USING btree (cancel_idempotency_key) WHERE (cancel_idempotency_key IS NOT NULL);


--
-- Name: idx_orders_cancelled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_cancelled_at ON public.orders USING btree (cancelled_at) WHERE (cancelled_at IS NOT NULL);


--
-- Name: idx_outbox_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_created_at ON public.outbox USING btree (created_at);


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('001'),
    ('002'),
    ('003'),
    ('004'),
    ('005'),
    ('006'),
    ('007'),
    ('008');
