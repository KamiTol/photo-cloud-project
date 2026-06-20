-- =============================================
-- PHOTO CLOUD - Tabla de usuarios
-- Ejecutar despues de 01-init-schema.sql
-- =============================================

-- Tabla de usuarios del sistema
CREATE TABLE IF NOT EXISTS usuarios (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  creado_en     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);

-- Agregar columna usuario_id a medios para saber quien subio cada archivo
ALTER TABLE medios
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_medios_usuario_id ON medios (usuario_id);

-- El hash ya no es unico globalmente: el mismo archivo puede pertenecer a distintos usuarios
-- Reemplazamos la restriccion global por una restriccion compuesta (hash + usuario)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medios_hash_key') THEN
    ALTER TABLE medios DROP CONSTRAINT medios_hash_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medios_hash_usuario_unique') THEN
    ALTER TABLE medios ADD CONSTRAINT medios_hash_usuario_unique UNIQUE (hash, usuario_id);
  END IF;
END $$;

-- Permisos para el usuario de la aplicacion
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin_fotos') THEN
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin_fotos;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin_fotos;
  END IF;
END $$;
