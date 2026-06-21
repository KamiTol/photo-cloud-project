package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

	pb "go-sync/gen/filesync"
)

const (
	tamanoChunk = 2 * 1024 * 1024 // 2 MB por chunk
	servidorDef = "localhost:50051"
	apiDef      = "http://localhost:3000/api"
)

// obtenerToken llama a /api/auth/login y devuelve el JWT
func obtenerToken(apiURL, email, password string) (string, error) {
	cuerpo, _ := json.Marshal(map[string]string{"email": email, "password": password})
	resp, err := http.Post(apiURL+"/auth/login", "application/json", bytes.NewReader(cuerpo))
	if err != nil {
		return "", fmt.Errorf("error conectando a la API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("login fallido (HTTP %d) — verifica email y contraseña", resp.StatusCode)
	}
	var resultado struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&resultado); err != nil {
		return "", fmt.Errorf("respuesta inesperada del servidor: %w", err)
	}
	return resultado.Token, nil
}

func main() {
	// ── Flags CLI ─────────────────────────────────────────────────────────────
	var (
		servidor   = flag.String("server", servidorDef, "Dirección del servidor gRPC (host:puerto)")
		apiURL     = flag.String("api", apiDef, "URL base de la API REST (para autenticación automática)")
		directorio = flag.String("dir", ".", "Directorio local a sincronizar")
		token      = flag.String("token", "", "JWT manual (opcional si se usan --email/--password)")
		email      = flag.String("email", "", "Email de la cuenta para autenticación automática")
		password   = flag.String("password", "", "Contraseña para autenticación automática")
		borrar     = flag.Bool("delete", false, "Borrar del servidor archivos que no existan localmente (PELIGROSO)")
	)
	flag.Parse()

	// ── Obtener JWT ───────────────────────────────────────────────────────────
	// Prioridad: --token > --email/--password > variable de entorno
	if *token == "" {
		*token = os.Getenv("PHOTO_CLOUD_TOKEN")
	}
	if *token == "" && *email != "" && *password != "" {
		fmt.Printf("Autenticando como %s...\n", *email)
		t, err := obtenerToken(*apiURL, *email, *password)
		if err != nil {
			log.Fatalf("No se pudo autenticar: %v", err)
		}
		*token = t
		fmt.Println("✓ Sesión iniciada correctamente")
	}
	if *token == "" {
		log.Fatal("Proporciona credenciales con --email y --password, o un JWT con --token")
	}

	// ── Resolver directorio ───────────────────────────────────────────────────
	dirAbs, err := filepath.Abs(*directorio)
	if err != nil {
		log.Fatalf("Directorio inválido: %v", err)
	}
	info, err := os.Stat(dirAbs)
	if err != nil || !info.IsDir() {
		log.Fatalf("'%s' no es un directorio válido", dirAbs)
	}

	// ── Conectar al servidor gRPC ─────────────────────────────────────────────
	fmt.Printf("Conectando a %s...\n", *servidor)
	conn, err := grpc.NewClient(*servidor,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		log.Fatalf("No se pudo conectar: %v", err)
	}
	defer conn.Close()

	cliente := pb.NewFileSyncServiceClient(conn)

	// Contexto con JWT en metadatos
	ctx := metadata.NewOutgoingContext(
		context.Background(),
		metadata.Pairs("authorization", "Bearer "+*token),
	)

	fmt.Printf("Sincronizando directorio: %s\n\n", dirAbs)
	inicio := time.Now()

	// ── Obtener lista de hashes en el servidor ────────────────────────────────
	resp, err := cliente.ListarArchivos(ctx, &pb.SolicitudListar{})
	if err != nil {
		log.Fatalf("Error listando archivos en el servidor: %v", err)
	}

	hashesEnServidor := make(map[string]string) // hash → archivo_id
	for _, a := range resp.Archivos {
		if a.Hash != "" {
			hashesEnServidor[a.Hash] = a.Id
		}
	}
	fmt.Printf("Archivos en servidor: %d\n", len(resp.Archivos))

	// ── Recorrer directorio local ─────────────────────────────────────────────
	var (
		subidos  int
		saltados int
		errores  int
		bytesSubidos int64
	)

	err = filepath.WalkDir(dirAbs, func(ruta string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // continuar aunque haya errores de acceso
		}
		if d.IsDir() {
			return nil
		}

		// Solo sincronizar archivos de imagen y video
		if !esMediaSoportado(ruta) {
			return nil
		}

		nombreRelativo, _ := filepath.Rel(dirAbs, ruta)
		fmt.Printf("  Procesando: %s", nombreRelativo)

		// Calcular hash del archivo
		hash, tamano, err := calcularHashYTamano(ruta)
		if err != nil {
			fmt.Printf(" ✗ (error leyendo: %v)\n", err)
			errores++
			return nil
		}

		// Verificar si ya existe en el servidor
		if _, existe := hashesEnServidor[hash]; existe {
			fmt.Printf(" → ya sincronizado\n")
			saltados++
			return nil
		}

		// También verificar via RPC por si el hash no estaba en la lista inicial
		vrResp, err := cliente.VerificarHash(ctx, &pb.SolicitudHash{Hash: hash})
		if err == nil && vrResp.Existe {
			fmt.Printf(" → ya existe en servidor\n")
			saltados++
			return nil
		}

		// Subir el archivo
		fmt.Printf(" → subiendo (%s)...", formatearBytes(tamano))
		if err := subirArchivo(ctx, cliente, ruta, nombreRelativo, hash, tamano); err != nil {
			fmt.Printf(" ✗ (%v)\n", err)
			errores++
			return nil
		}

		fmt.Printf(" ✓\n")
		subidos++
		bytesSubidos += tamano
		return nil
	})

	if err != nil {
		log.Printf("Error recorriendo directorio: %v", err)
	}

	if *borrar {
		fmt.Println("\n⚠  Modo --delete no implementado aún (requiere confirmación explícita)")
	}

	// ── Resumen ───────────────────────────────────────────────────────────────
	duracion := time.Since(inicio).Round(time.Millisecond)
	fmt.Printf("\n────────────────────────────────────\n")
	fmt.Printf("Sincronización completada en %s\n", duracion)
	fmt.Printf("  Subidos:  %d archivo(s) (%s)\n", subidos, formatearBytes(bytesSubidos))
	fmt.Printf("  Saltados: %d (sin cambios)\n", saltados)
	if errores > 0 {
		fmt.Printf("  Errores:  %d\n", errores)
	}
}

// ── subirArchivo envía el archivo al servidor en chunks ───────────────────────
func subirArchivo(ctx context.Context, cliente pb.FileSyncServiceClient, ruta, nombre, hash string, tamano int64) error {
	archivo, err := os.Open(ruta)
	if err != nil {
		return fmt.Errorf("no se pudo abrir: %w", err)
	}
	defer archivo.Close()

	stream, err := cliente.SubirArchivo(ctx)
	if err != nil {
		return fmt.Errorf("error iniciando stream: %w", err)
	}

	mt := detectarMimetype(ruta)

	// Primer mensaje: metadatos
	if err := stream.Send(&pb.ChunkSubida{
		NombreOriginal: nombre,
		Mimetype:       mt,
		Hash:           hash,
		TamanoBytes:    tamano,
	}); err != nil {
		return fmt.Errorf("error enviando metadatos: %w", err)
	}

	// Chunks de datos
	buf := make([]byte, tamanoChunk)
	for {
		n, err := archivo.Read(buf)
		esUltimo := err == io.EOF || (err == nil && n < tamanoChunk)

		if n > 0 {
			chunk := &pb.ChunkSubida{
				Datos:   buf[:n],
				EsUltimo: esUltimo,
			}
			if serr := stream.Send(chunk); serr != nil {
				return fmt.Errorf("error enviando chunk: %w", serr)
			}
		}

		if esUltimo || err != nil {
			break
		}
	}

	resp, err := stream.CloseAndRecv()
	if err != nil {
		return fmt.Errorf("error cerrando stream: %w", err)
	}
	if !resp.Exito {
		return fmt.Errorf("servidor rechazó el archivo: %s", resp.Mensaje)
	}
	return nil
}

// ── calcularHashYTamano computa SHA-256 y el tamaño del archivo ───────────────
func calcularHashYTamano(ruta string) (hash string, tamano int64, err error) {
	f, err := os.Open(ruta)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()

	h := sha256.New()
	tamano, err = io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), tamano, nil
}

// ── detectarMimetype intenta detectar el MIME del archivo ────────────────────
func detectarMimetype(ruta string) string {
	ext := strings.ToLower(filepath.Ext(ruta))
	if mt := mime.TypeByExtension(ext); mt != "" {
		return mt
	}
	// Fallback: leer primeros 512 bytes
	f, err := os.Open(ruta)
	if err != nil {
		return "application/octet-stream"
	}
	defer f.Close()
	buf := make([]byte, 512)
	n, _ := f.Read(buf)
	return http.DetectContentType(buf[:n])
}

// ── esMediaSoportado filtra extensiones de imagen y video ────────────────────
var extensionesMedia = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true,
	".webp": true, ".bmp": true, ".tiff": true, ".heic": true,
	".mp4": true, ".mov": true, ".avi": true, ".mkv": true,
	".webm": true, ".m4v": true, ".3gp": true,
}

func esMediaSoportado(ruta string) bool {
	ext := strings.ToLower(filepath.Ext(ruta))
	return extensionesMedia[ext]
}

// ── formatearBytes convierte bytes a representación legible ──────────────────
func formatearBytes(b int64) string {
	switch {
	case b >= 1024*1024*1024:
		return fmt.Sprintf("%.2f GB", float64(b)/float64(1024*1024*1024))
	case b >= 1024*1024:
		return fmt.Sprintf("%.2f MB", float64(b)/float64(1024*1024))
	case b >= 1024:
		return fmt.Sprintf("%.2f KB", float64(b)/float64(1024))
	default:
		return fmt.Sprintf("%d B", b)
	}
}
