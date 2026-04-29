-- Migración: Documento adjunto opcional en justificaciones
-- Fecha: 2026-04-29
-- Descripción: Permite asociar un comprobante (PDF/imagen) a cada justificación.

-- 1. Columnas nuevas (idempotente)
ALTER TABLE justificaciones ADD COLUMN IF NOT EXISTS documento_url    text;
ALTER TABLE justificaciones ADD COLUMN IF NOT EXISTS documento_nombre text;

-- 2. Bucket dedicado en Supabase Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('justificaciones-docs', 'justificaciones-docs', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Política de acceso público (igual a la de facturas-pdfs)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'justificaciones_docs_public_access'
    ) THEN
        CREATE POLICY "justificaciones_docs_public_access"
            ON storage.objects
            FOR ALL
            USING (bucket_id = 'justificaciones-docs')
            WITH CHECK (bucket_id = 'justificaciones-docs');
    END IF;
END $$;
