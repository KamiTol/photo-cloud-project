import { useEffect, useState } from 'react';
import axios from 'axios';
import { Play } from 'lucide-react';
import VideoPlayer from './VideoPlayer';

function VideoGallery() {
  const [videos, setVideos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [videoActivo, setVideoActivo] = useState<{ id: string; nombreOriginal: string } | null>(null);

  useEffect(() => { cargarVideos(); }, []);

  const cargarVideos = () => {
    setCargando(true);
    axios.get('http://localhost:3000/api/streaming')
      .then(res => setVideos(res.data))
      .catch(err => console.error('Error cargando videos:', err))
      .finally(() => setCargando(false));
  };

  // El backend serializa entidades Media (camelCase); dejamos fallback snake_case por robustez
  const obtenerNombre = (v: any): string => v.nombreOriginal ?? v.nombre_original ?? 'Sin nombre';
  const obtenerFecha = (v: any): string => v.creadoEn ?? v.creado_en;

  // Agrupa los videos por clave "YYYY-MM" y devuelve los grupos ordenados de más reciente a más antiguo
  const agruparPorMes = (lista: any[]): Array<{ clave: string; videos: any[] }> => {
    const grupos: Record<string, any[]> = {};
    lista.forEach((v) => {
      const d = new Date(obtenerFecha(v));
      const anio = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const clave = `${anio}-${mes}`;
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(v);
    });
    return Object.keys(grupos)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((clave) => ({ clave, videos: grupos[clave] }));
  };

  // Convierte "2026-06" en "Junio 2026" usando locale es-CO (mes capitalizado + año)
  const formatearTituloGrupo = (clave: string): string => {
    const [anio, mes] = clave.split('-');
    const fecha = new Date(Number(anio), Number(mes) - 1, 1);
    const nombreMes = fecha.toLocaleString('es-CO', { month: 'long' });
    const mesCapitalizado = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
    return `${mesCapitalizado} ${anio}`;
  };

  // Convierte segundos a formato MM:SS (125 → "2:05"); '—' si no hay duración
  const formatearDuracion = (segundos?: number): string => {
    if (!segundos) return '—';
    const minutos = Math.floor(segundos / 60);
    const resto = Math.floor(segundos % 60);
    return `${minutos}:${String(resto).padStart(2, '0')}`;
  };

  // Formatea la fecha de creación para mostrarla en la tarjeta
  const formatearFecha = (valor: string): string => {
    if (!valor) return '';
    return new Date(valor).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      {/* 1. Encabezado de sección */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Play size={24} color="#2563eb" />
          <h1 style={{ margin: 0, fontSize: 22 }}>Streaming de Videos</h1>
        </div>
        <div style={{ color: '#6b7280', fontSize: 14 }}>{videos.length} video(s) disponibles</div>
        <button
          onClick={cargarVideos}
          title="Actualizar"
          style={{ marginLeft: 'auto', padding: '8px 12px', borderRadius: 8, background: '#111827', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          Actualizar
        </button>
      </div>

      {/* 2. Estado de carga */}
      {cargando && <div style={{ color: '#6b7280' }}>Cargando videos...</div>}

      {/* 3. Estado vacío */}
      {!cargando && videos.length === 0 && (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: '60px 20px' }}>
          No hay videos disponibles. Sube videos desde la galería principal.
        </div>
      )}

      {/* 4. Grid de tarjetas agrupado por mes */}
      {!cargando && videos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {agruparPorMes(videos).map((grupo) => (
            <div key={grupo.clave}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
                {formatearTituloGrupo(grupo.clave)}
                <span style={{ color: '#6b7280', fontWeight: 500, marginLeft: 8 }}>({grupo.videos.length})</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                {grupo.videos.map((video) => {
                  const duracion = video.metadatos?.video?.duracionSegundos;
                  return (
                    // 5. Tarjeta de video
                    <div
                      key={video.id}
                      onClick={() => setVideoActivo({ id: video.id, nombreOriginal: obtenerNombre(video) })}
                      style={{
                        borderRadius: 10,
                        overflow: 'hidden',
                        boxShadow: '0 6px 20px rgba(2,6,23,0.08)',
                        cursor: 'pointer',
                        background: '#111827',
                        position: 'relative',
                        height: 140,
                        transition: 'transform 180ms ease'
                      }}
                      onMouseEnter={(e: any) => (e.currentTarget.style.transform = 'translateY(-6px)')}
                      onMouseLeave={(e: any) => (e.currentTarget.style.transform = 'translateY(0)')}
                    >
                      {/* Thumbnail: si falla la imagen se oculta y queda el fondo oscuro con el Play */}
                      <img
                        src={`http://localhost:3000/api/media/thumb/${video.id}`}
                        alt={obtenerNombre(video)}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />

                      {/* Overlay con ícono Play grande y semitransparente, siempre visible */}
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <Play size={48} color="rgba(255,255,255,0.85)" fill="rgba(255,255,255,0.85)" />
                      </div>

                      {/* Barra inferior con nombre, duración y fecha (overlay con degradado, igual que App.tsx) */}
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 12px', background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)', color: '#fff', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {obtenerNombre(video)}
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                            {formatearFecha(obtenerFecha(video))}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, background: 'rgba(0,0,0,0.55)', padding: '2px 6px', borderRadius: 6, flexShrink: 0 }}>
                          {formatearDuracion(duracion)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6. Reproductor de video activo */}
      {videoActivo !== null && (
        <VideoPlayer
          videoId={videoActivo.id}
          nombreOriginal={videoActivo.nombreOriginal}
          onCerrar={() => setVideoActivo(null)}
        />
      )}
    </div>
  );
}

export default VideoGallery;
