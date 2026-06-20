-- =============================================
-- PHOTO CLOUD - Sistema de cuotas por usuario
-- Ejecutar despues de 02-usuarios.sql
-- =============================================

-- Cuota maxima configurable por usuario (default 1 GB)
-- uso_bytes se actualiza en cada subida/borrado
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cuota_maxima_bytes BIGINT NOT NULL DEFAULT 1073741824,
  ADD COLUMN IF NOT EXISTS uso_bytes          BIGINT NOT NULL DEFAULT 0;

-- Sincronizar uso_bytes con lo que ya existe en la tabla medios
-- (por si se ejecuta esta migracion sobre datos existentes)
UPDATE usuarios u
SET uso_bytes = COALESCE((
  SELECT SUM(m.tamano_bytes)
  FROM medios m
  WHERE m.usuario_id = u.id
), 0);

-- Restriccion: uso no puede ser negativo
ALTER TABLE usuarios
  ADD CONSTRAINT uso_bytes_no_negativo CHECK (uso_bytes >= 0);
