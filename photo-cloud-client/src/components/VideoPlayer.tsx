import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getToken } from '../api';

interface VideoPlayerProps {
  videoId: string;
  nombreOriginal: string;
  onCerrar: () => void;
}

function VideoPlayer({ videoId, nombreOriginal, onCerrar }: VideoPlayerProps) {
  // Controla si el <video> falló al cargar para mostrar un mensaje de error
  const [errorCarga, setErrorCarga] = useState(false);

  // Cierre del modal con la tecla Escape (listener registrado al montar y limpiado al desmontar)
  useEffect(() => {
    const manejarTecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCerrar();
      }
    };
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [onCerrar]);

  return (
    // Overlay oscuro a pantalla completa: un click fuera del video cierra el modal
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif'
      }}
    >
      {/* Contenedor centrado del reproductor (stopPropagation evita que el click interno cierre el modal) */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 960,
          width: '100%',
          margin: 'auto',
          padding: 20,
          boxSizing: 'border-box'
        }}
      >
        {/* Barra superior: nombre del archivo + botón de cerrar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div
            style={{
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1
            }}
            title={nombreOriginal}
          >
            {nombreOriginal}
          </div>
          <button
            onClick={onCerrar}
            title="Cerrar"
            aria-label="Cerrar"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <X color="#fff" size={20} />
          </button>
        </div>

        {/* Reproductor de video con controles nativos del navegador */}
        {errorCarga ? (
          <div
            style={{
              width: '100%',
              maxHeight: '70vh',
              minHeight: 200,
              borderRadius: 8,
              background: '#000',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: 20,
              boxSizing: 'border-box'
            }}
          >
            No se pudo cargar el video. Verifica que el archivo exista en el servidor.
          </div>
        ) : (
          <video
            src={`http://localhost:3000/api/streaming/${videoId}?token=${getToken()}`}
            controls={true}
            autoPlay={true}
            preload="metadata"
            onError={() => setErrorCarga(true)}
            style={{
              width: '100%',
              maxHeight: '70vh',
              borderRadius: 8,
              background: '#000',
              display: 'block'
            }}
          />
        )}

        {/* Barra informativa bajo el video */}
        <div style={{ marginTop: 14 }}>
          <div style={{ color: '#d1d5db', fontSize: 14 }}>
            Usa los controles del reproductor para pausar, avanzar o cambiar el volumen.
          </div>
          <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
            La reproducción usa streaming adaptativo — no descarga el archivo completo.
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayer;
