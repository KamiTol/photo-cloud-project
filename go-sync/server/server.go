package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "go-sync/gen/filesync"
)

// SyncServer implementa FileSyncServiceServer (generado por protoc).
type SyncServer struct {
	pb.UnimplementedFileSyncServiceServer
	db     *pgxpool.Pool
	s3c    *s3.Client
	bucket string
}

// ── SubirArchivo ──────────────────────────────────────────────────────────────
// El cliente envía un stream de ChunkSubida.
// Primer mensaje: metadatos (nombre, mimetype, hash, tamaño).
// Siguientes: datos binarios + es_ultimo=true en el último.
func (srv *SyncServer) SubirArchivo(stream pb.FileSyncService_SubirArchivoServer) error {
	usuario := usuarioDeCtx(stream.Context())
	if usuario == nil {
		return status.Error(codes.Unauthenticated, "sin usuario en contexto")
	}

	// ── Recibir primer chunk (metadatos) ──────────────────────────────────────
	primero, err := stream.Recv()
	if err != nil {
		return status.Errorf(codes.Internal, "error recibiendo primer chunk: %v", err)
	}
	if primero.NombreOriginal == "" || primero.Hash == "" {
		return status.Error(codes.InvalidArgument, "primer chunk debe incluir nombre_original y hash")
	}

	nombreOriginal := primero.NombreOriginal
	mimetype := primero.Mimetype
	hash := primero.Hash
	tamanoEsperado := primero.TamanoBytes
	if mimetype == "" {
		mimetype = "application/octet-stream"
	}

	// Verificar cuota del usuario
	if err := verificarCuota(stream.Context(), srv.db, usuario.ID, tamanoEsperado); err != nil {
		return err
	}

	// ── Acumular datos en memoria ─────────────────────────────────────────────
	var buf bytes.Buffer

	// Si el primer chunk también trae datos, los incluimos
	if len(primero.Datos) > 0 {
		buf.Write(primero.Datos)
	}

	if !primero.EsUltimo {
		for {
			chunk, err := stream.Recv()
			if err == io.EOF {
				break
			}
			if err != nil {
				return status.Errorf(codes.Internal, "error recibiendo chunk: %v", err)
			}
			buf.Write(chunk.Datos)
			if chunk.EsUltimo {
				break
			}
		}
	}

	contenido := buf.Bytes()
	tamanoReal := int64(len(contenido))

	// ── Determinar tipo (IMAGEN / VIDEO) para el ENUM de PostgreSQL ───────────
	tipoMedia := "IMAGEN"
	if strings.HasPrefix(mimetype, "video/") {
		tipoMedia = "VIDEO"
	}

	// ── Subir a MinIO — la clave es el UUID del archivo ───────────────────────
	archivoID := uuid.New().String()

	_, err = srv.s3c.PutObject(stream.Context(), &s3.PutObjectInput{
		Bucket:        aws.String(srv.bucket),
		Key:           aws.String(archivoID), // igual que Node.js: key = id
		Body:          bytes.NewReader(contenido),
		ContentLength: aws.Int64(tamanoReal),
		ContentType:   aws.String(mimetype),
	})
	if err != nil {
		return status.Errorf(codes.Internal, "error subiendo a MinIO: %v", err)
	}

	// ── Registrar en PostgreSQL ───────────────────────────────────────────────
	// Esquema real: id, nombre_original, mimetype, tipo, tamano_bytes, hash, metadatos, creado_en, usuario_id
	_, err = srv.db.Exec(stream.Context(), `
		INSERT INTO medios
		  (id, nombre_original, mimetype, tipo, tamano_bytes, hash, metadatos, creado_en, usuario_id)
		VALUES ($1, $2, $3, $4::tipo_media, $5, $6, '{}', NOW(), $7)
		ON CONFLICT (hash, usuario_id) DO NOTHING
	`, archivoID, nombreOriginal, mimetype, tipoMedia, tamanoReal, hash, usuario.ID)
	if err != nil {
		// Intentar borrar el objeto de MinIO para no dejar huérfanos
		_ = borrarDeMinIO(context.Background(), srv.s3c, srv.bucket, archivoID)
		return status.Errorf(codes.Internal, "error registrando en BD: %v", err)
	}

	// ── Actualizar uso de cuota ───────────────────────────────────────────────
	_, _ = srv.db.Exec(stream.Context(), `
		UPDATE usuarios SET uso_bytes = uso_bytes + $1 WHERE id = $2
	`, tamanoReal, usuario.ID)

	return stream.SendAndClose(&pb.RespuestaSubida{
		Exito:     true,
		ArchivoId: archivoID,
		Mensaje:   fmt.Sprintf("Archivo '%s' sincronizado (%d bytes)", nombreOriginal, tamanoReal),
	})
}

// ── ListarArchivos ────────────────────────────────────────────────────────────
func (srv *SyncServer) ListarArchivos(ctx context.Context, _ *pb.SolicitudListar) (*pb.RespuestaListar, error) {
	usuario := usuarioDeCtx(ctx)
	if usuario == nil {
		return nil, status.Error(codes.Unauthenticated, "sin usuario en contexto")
	}

	filas, err := srv.db.Query(ctx, `
		SELECT id, nombre_original, hash, tamano_bytes, creado_en
		FROM medios
		WHERE usuario_id = $1
		ORDER BY creado_en DESC
	`, usuario.ID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "error consultando BD: %v", err)
	}
	defer filas.Close()

	var archivos []*pb.ArchivoInfo
	for filas.Next() {
		var (
			id, nombre, hash string
			tamano           int64
			creadoEn         time.Time
		)
		if err := filas.Scan(&id, &nombre, &hash, &tamano, &creadoEn); err != nil {
			continue
		}
		archivos = append(archivos, &pb.ArchivoInfo{
			Id:             id,
			NombreOriginal: nombre,
			Hash:           hash,
			TamanoBytes:    tamano,
			CreadoEn:       creadoEn.Format(time.RFC3339),
		})
	}

	return &pb.RespuestaListar{Archivos: archivos}, nil
}

// ── VerificarHash ─────────────────────────────────────────────────────────────
func (srv *SyncServer) VerificarHash(ctx context.Context, req *pb.SolicitudHash) (*pb.RespuestaHash, error) {
	usuario := usuarioDeCtx(ctx)
	if usuario == nil {
		return nil, status.Error(codes.Unauthenticated, "sin usuario en contexto")
	}
	if req.Hash == "" {
		return nil, status.Error(codes.InvalidArgument, "hash requerido")
	}

	var archivoID string
	err := srv.db.QueryRow(ctx, `
		SELECT id FROM medios WHERE usuario_id = $1 AND hash = $2 LIMIT 1
	`, usuario.ID, req.Hash).Scan(&archivoID)

	if err != nil {
		// No encontrado → el archivo no existe aún
		return &pb.RespuestaHash{Existe: false}, nil
	}
	return &pb.RespuestaHash{Existe: true, ArchivoId: archivoID}, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func verificarCuota(ctx context.Context, db *pgxpool.Pool, usuarioID string, bytesNuevos int64) error {
	var uso, limite int64
	err := db.QueryRow(ctx, `
		SELECT uso_bytes, cuota_maxima_bytes FROM usuarios WHERE id = $1
	`, usuarioID).Scan(&uso, &limite)
	if err != nil {
		return status.Errorf(codes.Internal, "no se pudo verificar cuota: %v", err)
	}
	if uso+bytesNuevos > limite {
		disponible := limite - uso
		return status.Errorf(codes.ResourceExhausted,
			"cuota insuficiente: disponible %d bytes, se requieren %d bytes", disponible, bytesNuevos)
	}
	return nil
}

func borrarDeMinIO(ctx context.Context, c *s3.Client, bucket, key string) error {
	_, err := c.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}
