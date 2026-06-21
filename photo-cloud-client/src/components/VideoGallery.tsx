import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { api, getToken } from '../api';
import VideoPlayer from './VideoPlayer';

// ── Thumbnail usando <video> directamente ─────────────────────────────────────
// Evita problemas de CORS con canvas. El elemento <video> hace seek a 1s
// y el navegador muestra ese frame como preview sin necesidad de capturarlo.
function VideoThumbnail({ videoId, alt }: { videoId: string; alt: string }) {
  return (
    <video
      src={`http://localhost:3000/api/streaming/${videoId}?token=${getToken()}`}
      muted
      preload="metadata"
      playsInline
      aria-label={alt}
      onLoadedMetadata={e => { e.currentTarget.currentTime = 1; }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
    />
  );
}

function VideoGallery() {
  const [videos, setVideos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [videoActivo, setVideoActivo] = useState<{ id: string; nombreOriginal: string } | null>(null);

  useEffect(() => { cargarVideos(); }, []);

  const cargarVideos = () => {
    setCargando(true);
    api.get('/streaming')
      .then(res => setVideos(res.data))
      .catch(err => console.error('Error cargando videos:', err))
      .finally(() => setCargando(false));
  };

  const obtenerNombre = (v: any): string => v.nombreOriginal ?? v.nombre_original ?? 'Sin nombre';
  const obtenerFecha  = (v: any): string => v.creadoEn ?? v.creado_en;

  const agruparPorMes = (lista: any[]): Array<{ clave: string; videos: any[] }> => {
    const grupos: Record<string, any[]> = {};
    lista.forEach((v) => {
      const d = new Date(obtenerFecha(v));
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(v);
    });
    return Object.keys(grupos)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((clave) => ({ clave, videos: grupos[clave] }));
  };

  const formatearTituloGrupo = (clave: string): string => {
    const [anio, mes] = clave.split('-');
    const fecha = new Date(Number(anio), Number(mes) - 1, 1);
    const nombre = fecha.toLocaleString('es-CO', { month: 'long' });
    return `${nombre.charAt(0).toUpperCase() + nombre.slice(1)} ${anio}`;
  };

  const formatearDuracion = (segundos?: number): string => {
    if (!segundos) return '—';
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const formatearFecha = (valor: string): string =>
    valor ? new Date(valor).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <div>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Play size={20} color="#2563eb" />
          <span style={{ fontWeight: 700, fontSize: 16 }}>Videos</span>
        </div>
        <div style={{ color: '#6b7280', fontSize: 13 }}>{videos.length} video(s)</div>
        <button onClick={cargarVideos} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, background: '#1f2937', color: '#9ca3af', border: '1px solid #374151', cursor: 'pointer', fontSize: 13 }}>
          Actualizar
        </button>
      </div>

      {cargando && <div style={{ color: '#6b7280' }}>Cargando videos...</div>}

      {!cargando && videos.length === 0 && (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: '60px 20px' }}>
          No hay videos aún. Sube un video desde la pestaña de fotos.
        </div>
      )}

      {!cargando && videos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {agruparPorMes(videos).map((grupo) => (
            <div key={grupo.clave}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#e5e7eb', marginBottom: 10 }}>
                {formatearTituloGrupo(grupo.clave)}
                <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>({grupo.videos.length})</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                {grupo.videos.map((video) => {
                  const duracion = video.metadatos?.video?.duracionSegundos;
                  return (
                    <div
                      key={video.id}
                      onClick={() => setVideoActivo({ id: video.id, nombreOriginal: obtenerNombre(video) })}
                      style={{ borderRadius: 12, overflow: 'hidden', background: '#1f2937', position: 'relative', height: 150, cursor: 'pointer', transition: 'transform 180ms' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                    >
                      <VideoThumbnail videoId={video.id} alt={obtenerNombre(video)} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <Play size={44} color="rgba(255,255,255,0.85)" fill="rgba(255,255,255,0.85)" />
                      </div>
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 12px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{obtenerNombre(video)}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{formatearFecha(obtenerFecha(video))}</div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 6, flexShrink: 0, marginLeft: 8 }}>
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

      {videoActivo && (
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
