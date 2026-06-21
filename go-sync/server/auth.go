package main

import (
	"context"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type ctxKey string

const claveUsuario ctxKey = "usuario"

// UsuarioCtx contiene la info del usuario autenticado inyectada en el contexto.
type UsuarioCtx struct {
	ID     string
	Email  string
	Nombre string
}

// interceptorAuth verifica el JWT en los metadatos gRPC y rechaza llamadas sin token válido.
func interceptorAuth(jwtSecret string) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		_ *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		u, err := extraerUsuario(ctx, jwtSecret)
		if err != nil {
			return nil, err
		}
		return handler(context.WithValue(ctx, claveUsuario, u), req)
	}
}

// interceptorAuthStream hace lo mismo para RPCs de streaming.
func interceptorAuthStream(jwtSecret string) grpc.StreamServerInterceptor {
	return func(
		srv any,
		ss grpc.ServerStream,
		_ *grpc.StreamServerInfo,
		handler grpc.StreamHandler,
	) error {
		u, err := extraerUsuario(ss.Context(), jwtSecret)
		if err != nil {
			return err
		}
		return handler(srv, &streamConUsuario{ss, context.WithValue(ss.Context(), claveUsuario, u)})
	}
}

// streamConUsuario envuelve un ServerStream reemplazando su contexto.
type streamConUsuario struct {
	grpc.ServerStream
	ctx context.Context
}

func (s *streamConUsuario) Context() context.Context { return s.ctx }

// extraerUsuario lee el header "authorization: Bearer <token>" de los metadatos gRPC.
func extraerUsuario(ctx context.Context, secret string) (*UsuarioCtx, error) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "sin metadatos gRPC")
	}
	vals := md.Get("authorization")
	if len(vals) == 0 {
		return nil, status.Error(codes.Unauthenticated, "token no proporcionado")
	}
	raw := strings.TrimPrefix(vals[0], "Bearer ")
	if raw == vals[0] {
		return nil, status.Error(codes.Unauthenticated, "formato de token invalido")
	}

	claims := jwt.MapClaims{}
	tok, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, status.Error(codes.Unauthenticated, "algoritmo de firma inesperado")
		}
		return []byte(secret), nil
	})
	if err != nil || !tok.Valid {
		return nil, status.Error(codes.Unauthenticated, "token invalido o expirado")
	}

	sub, _ := claims["sub"].(string)
	email, _ := claims["email"].(string)
	nombre, _ := claims["nombre"].(string)
	return &UsuarioCtx{ID: sub, Email: email, Nombre: nombre}, nil
}

// usuarioDeCtx extrae el usuario del contexto (ya validado por el interceptor).
func usuarioDeCtx(ctx context.Context) *UsuarioCtx {
	u, _ := ctx.Value(claveUsuario).(*UsuarioCtx)
	return u
}
