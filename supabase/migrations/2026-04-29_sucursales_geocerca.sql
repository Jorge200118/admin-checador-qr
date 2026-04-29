-- Migración: Geocerca por sucursal
-- Fecha: 2026-04-29
-- Descripción: Catálogo de sucursales con coordenadas y radio para validación de geocerca en PWA.

CREATE TABLE IF NOT EXISTS sucursales (
    id                  SERIAL PRIMARY KEY,
    nombre              TEXT UNIQUE NOT NULL,
    latitud             NUMERIC(10,7),
    longitud            NUMERIC(10,7),
    radio_metros        INTEGER DEFAULT 150,
    geocerca_activa     BOOLEAN DEFAULT false,
    actualizado_en      TIMESTAMPTZ DEFAULT now(),
    actualizado_por     TEXT
);

-- Seed con las 8 sucursales actuales del catálogo (ver Admin.js:467 SUCURSALES_LIST)
INSERT INTO sucursales (nombre) VALUES
    ('MATRIZ'),
    ('LA PAZ'),
    ('SAN JOSE'),
    ('TAMARAL'),
    ('CABOS'),
    ('EL FUERTE'),
    ('JUAN JOSE RIOS'),
    ('CULIACAN')
ON CONFLICT (nombre) DO NOTHING;

-- RLS: lectura pública (la PWA usa anon key y necesita leer la geocerca antes de cada check),
-- escrituras controladas: el admin actual también usa anon key, así que permitimos UPDATE
-- desde anon. La protección efectiva está en UI (solo superadmin ve la pantalla), coherente
-- con el resto del proyecto (ver supabase-config.js:927-932).
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read sucursales" ON sucursales;
CREATE POLICY "anon read sucursales"
    ON sucursales FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "anon update sucursales" ON sucursales;
CREATE POLICY "anon update sucursales"
    ON sucursales FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);
