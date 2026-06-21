package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"google.golang.org/grpc"

	pb "go-sync/gen/filesync"
)

func main() {
	// Cargar variables del mismo .env que usa el servidor Node.js.
	// Busca en varias ubicaciones posibles.
	// Cargar todos los .env encontrados (el último sobreescribe al anterior).
	// go-sync/.env va último para que sus valores tengan precedencia.
	for _, ruta := range []string{
		"../.env",
		"../photo-cloud-server/.env",
		".env",   // go-sync/.env — tiene precedencia sobre los anteriores
	} {
		if err := godotenv.Load(ruta); err == nil {
			log.Printf("Configuración cargada desde: %s", ruta)
		}
	}

	puerto := getEnv("GRPC_PORT", "50051")
	jwtSecret := mustEnv("JWT_SECRET")

	// DATABASE_URL puede estar directa, o se construye desde las variables individuales
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		host := getEnv("DB_HOST", "localhost")
		port := getEnv("DB_PORT", "5432")
		name := getEnv("DB_NAME", "photo_cloud")
		user := getEnv("DB_USER", "postgres")
		pass := os.Getenv("DB_PASSWORD")
		dbURL = fmt.Sprintf("postgresql://%s:%s@%s:%s/%s", user, pass, host, port, name)
	}

	// MINIO_ENDPOINT puede venir con o sin "http://"
	minioEndpoint := mustEnv("MINIO_ENDPOINT")
	minioEndpoint = strings.TrimPrefix(minioEndpoint, "http://")
	minioEndpoint = strings.TrimPrefix(minioEndpoint, "https://")

	minioKeyID := mustEnv("MINIO_ACCESS_KEY")
	minioSecret := mustEnv("MINIO_SECRET_KEY")
	minioBucket := getEnv("MINIO_BUCKET", "fotos-originales")

	// ── Conectar a PostgreSQL ─────────────────────────────────────────────────
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("Error conectando a PostgreSQL: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(context.Background()); err != nil {
		log.Fatalf("PostgreSQL no responde: %v", err)
	}
	log.Println("✓ PostgreSQL conectado")

	// ── Conectar a MinIO (compatible S3) ─────────────────────────────────────
	awsCfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion("us-east-1"),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			minioKeyID, minioSecret, "",
		)),
	)
	if err != nil {
		log.Fatalf("Error configurando cliente S3/MinIO: %v", err)
	}
	s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String("http://" + minioEndpoint)
		o.UsePathStyle = true // requerido por MinIO
	})
	log.Printf("✓ MinIO conectado en %s (bucket: %s)\n", minioEndpoint, minioBucket)

	// ── Iniciar servidor gRPC ─────────────────────────────────────────────────
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", puerto))
	if err != nil {
		log.Fatalf("No se pudo abrir puerto %s: %v", puerto, err)
	}

	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(interceptorAuth(jwtSecret)),
		grpc.StreamInterceptor(interceptorAuthStream(jwtSecret)),
	)

	pb.RegisterFileSyncServiceServer(grpcServer, &SyncServer{
		db:     pool,
		s3c:    s3Client,
		bucket: minioBucket,
	})

	log.Printf("🚀 Servidor gRPC escuchando en :%s\n", puerto)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Error en servidor gRPC: %v", err)
	}
}

// ── Helpers de entorno ────────────────────────────────────────────────────────

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("Variable de entorno requerida no definida: %s", key)
	}
	return v
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
