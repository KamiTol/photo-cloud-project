-- =============================================
-- PHOTO CLOUD - Esquema inicial de base de datos
-- Ejecutar una sola vez al iniciar el sistema
-- =============================================

-- Tipo enumerado para clasificar el archivo
DO $$ BEGIN
  CREATE TYPE tipo_media AS ENUM ('IMAGEN', 'VIDEO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tabla principal de medios (fotos y videos)
CREATE TABLE IF NOT EXISTS medios (
  id            UUID          PRIMARY KEY,
  nombre_original TEXT        NOT NULL,
  mimetype      VARCHAR(100)  NOT NULL,
  tipo          tipo_media    NOT NULL,
  tamano_bytes  BIGINT        NOT NULL CHECK (tamano_bytes > 0),
  hash          CHAR(64)      NOT NULL UNIQUE,   -- SHA-256 para evitar duplicados
  metadatos     JSONB         NOT NULL DEFAULT '{}',
  creado_en     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indices para busquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_medios_tipo      ON medios (tipo);
CREATE INDEX IF NOT EXISTS idx_medios_creado_en ON medios (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_medios_hash      ON medios (hash);

-- Permisos para el usuario de la aplicacion
-- (necesario cuando el schema lo aplica el superusuario postgres)
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin_fotos') THEN
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin_fotos;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin_fotos;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO admin_fotos;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO admin_fotos;
  END IF;
END $$;
