-- =============================================
-- PHOTO CLOUD - Permisos Unix de archivos
-- Ejecutar despues de 03-cuotas.sql
-- =============================================

-- Tabla de permisos estilo Unix para compartir archivos entre usuarios.
-- El propietario siempre tiene acceso total (no necesita entrada aqui).
-- Esta tabla modela los permisos que el propietario concede a otros usuarios.
CREATE TABLE IF NOT EXISTS compartidos (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_id      UUID         NOT NULL REFERENCES medios(id) ON DELETE CASCADE,
  propietario_id  UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  destinatario_id UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  puede_leer      BOOLEAN      NOT NULL DEFAULT true,   -- r: ver y descargar
  puede_escribir  BOOLEAN      NOT NULL DEFAULT false,  -- w: borrar o reemplazar
  puede_ejecutar  BOOLEAN      NOT NULL DEFAULT false,  -- x: (reservado para directorios)
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT no_compartir_consigo_mismo CHECK (propietario_id != destinatario_id),
  UNIQUE (archivo_id, destinatario_id)
);

CREATE INDEX IF NOT EXISTS idx_compartidos_destinatario ON compartidos (destinatario_id);
CREATE INDEX IF NOT EXISTS idx_compartidos_archivo      ON compartidos (archivo_id);
CREATE INDEX IF NOT EXISTS idx_compartidos_propietario  ON compartidos (propietario_id);

-- Permisos para el usuario de la aplicacion
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin_fotos') THEN
    GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO admin_fotos;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin_fotos;
  END IF;
END $$;
