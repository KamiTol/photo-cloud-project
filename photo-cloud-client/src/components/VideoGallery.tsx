import { useEffect, useRef, useState } from 'react';
import { DownloadCloud, Play, Plus, Share2, Trash2, UserCheck } from 'lucide-react';
import { api, getToken } from '../api';
import VideoPlayer from './VideoPlayer';

function VideoThumbnail({ videoId, alt }: { videoId: string; alt: string }) {
  return (
    <video
      src={'http://localhost:3000/api/streaming/' + videoId + '?token=' + getToken()}
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
  const [videos, setVideos]         = useState<any[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [subiendo, setSubiendo]     = useState(false);
  const [videoActivo, setVideoActivo] = useState<{ id: string; nombreOriginal: string } | null>(null);
  const [modalCompartir, setModalCompartir] = useState<{ video: any; permisos: any[] } | null>(null);
  const [emailCompartir, setEmailCompartir] = useState('');
  const [puedeEscribir, setPuedeEscribir]   = useState(false);
  const [errorCompartir, setErrorCompartir] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { cargarVideos(); }, []);

  const cargarVideos = () => {
    setCargando(true);
    api.get('/streaming')
      .then(res => setVideos(res.data))
      .catch(err => console.error('Error cargando videos:', err))
      .finally(() => setCargando(false));
  };

  const subirVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setSubiendo(true);
    try {
      await Promise.all(files.map(file => {
        const form = new FormData();
        form.append('archivo', file);
        form.append('fechaArchivo', String(file.lastModified));
        return api.post('/media/upload', form);
      }));
      await cargarVideos();
    } finally {
      setSubiendo(false);
      if (e.target) e.target.value = '';
    }
  };

  const eliminar = (id: string) => {
    api.delete('/media/' + id).then(cargarVideos);
  };

  const descargar = async (video: any) => {
    const res = await api.get('/media/' + video.id + '/download', { responseType: 'arraybuffer' });
    const blob = new Blob([res.data], { type: res.headers['content-type'] });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = obtenerNombre(video);
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const abrirCompartir = async (video: any) => {
    setErrorCompartir(''); setEmailCompartir(''); setPuedeEscribir(false);
    try {
      const res = await api.get('/media/' + video.id + '/compartidos');
      setModalCompartir({ video, permisos: res.data });
    } catch {
      setModalCompartir({ video, permisos: [] });
    }
  };

  const enviarCompartir = async () => {
    if (!modalCompartir || !emailCompartir.trim()) return;
    setErrorCompartir('');
    try {
      await api.post('/media/' + modalCompartir.video.id + '/compartir', {
        email: emailCompartir.trim(), leer: true, escribir: puedeEscribir, ejecutar: false,
      });
      const res = await api.get('/media/' + modalCompartir.video.id + '/compartidos');
      setModalCompartir(prev => prev ? { ...prev, permisos: res.data } : null);
      setEmailCompartir('');
    } catch (err: any) {
      setErrorCompartir(err.response?.data?.error || 'Error al compartir.');
    }
  };

  const revocarAcceso = async (videoId: string, usuarioId: string) => {
    await api.delete('/media/' + videoId + '/compartir/' + usuarioId);
    const res = await api.get('/media/' + videoId + '/compartidos');
    setModalCompartir(prev => prev ? { ...prev, permisos: res.data } : null);
  };

  const obtenerNombre = (v: any): string => v.nombreOriginal ?? v.nombre_original ?? 'Sin nombre';
  const obtenerFecha  = (v: any): string => v.creadoEn ?? v.creado_en;

  const agruparPorMes = (lista: any[]): Array<{ clave: string; videos: any[] }> => {
    const grupos: Record<string, any[]> = {};
    lista.forEach(v => {
      const d = new Date(obtenerFecha(v));
      const clave = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(v);
    });
    return Object.keys(grupos).sort((a, b) => a < b ? 1 : -1).map(clave => ({ clave, videos: grupos[clave] }));
  };

  const formatearTituloGrupo = (clave: string): string => {
    const [anio, mes] = clave.split('-');
    const fecha = new Date(Number(anio), Number(mes) - 1, 1);
    const nombre = fecha.toLocaleString('es-CO', { month: 'long' });
    return nombre.charAt(0).toUpperCase() + nombre.slice(1) + ' ' + anio;
  };

  const formatearDuracion = (seg?: number): string => {
    if (!seg) return '';
    return Math.floor(seg / 60) + ':' + String(Math.floor(seg % 60)).padStart(2, '0');
  };

  const formatearFecha = (valor: string): string =>
    valor ? new Date(valor).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <div>
      {/* Barra de herramientas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input ref={fileInputRef} type="file" multiple accept="video/*" onChange={subirVideo} style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} disabled={subiendo}
          style={{ width: 48, height: 48, borderRadius: '50%', background: '#7c3aed', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Plus size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Play size={18} color="#a78bfa" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Videos</span>
          <span style={{ color: '#6b7280', fontSize: 13 }}>({videos.length})</span>
        </div>
        {subiendo && <span style={{ color: '#a78bfa', fontSize: 13 }}>Subiendo...</span>}
        <button onClick={cargarVideos}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, background: '#1f2937', color: '#9ca3af', border: '1px solid #374151', cursor: 'pointer', fontSize: 13 }}>
          Actualizar
        </button>
      </div>

      {cargando && <div style={{ color: '#6b7280' }}>Cargando videos...</div>}

      {!cargando && videos.length === 0 && (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: '60px 20px' }}>
          <p>No hay videos aun.</p>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ marginTop: 12, padding: '10px 20px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Subir primer video
          </button>
        </div>
      )}

      {!cargando && videos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {agruparPorMes(videos).map(grupo => (
            <div key={grupo.clave}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#e5e7eb', marginBottom: 10 }}>
                {formatearTituloGrupo(grupo.clave)}
                <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>({grupo.videos.length})</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                {grupo.videos.map(video => {
                  const duracion = video.metadatos?.video?.duracionSegundos;
                  const puedeEliminar = video.esPropietario !== false || video.puedeEscribir === true;
                  return (
                    <div key={video.id}
                      onClick={() => setVideoActivo({ id: video.id, nombreOriginal: obtenerNombre(video) })}
                      style={{ borderRadius: 12, overflow: 'hidden', background: '#1f2937', position: 'relative', height: 150, cursor: 'pointer', transition: 'transform 180ms' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>

                      <VideoThumbnail videoId={video.id} alt={obtenerNombre(video)} />

                      {/* Badge de compartido por */}
                      {video.esPropietario === false && (
                        <div title={'Compartido por ' + (video.propietarioNombre || video.propietarioEmail)}
                          style={{ position: 'absolute', top: 8, left: 8, background: '#7c3aed', borderRadius: 20, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 4, zIndex: 2 }}>
                          <UserCheck size={11} color="#fff" />
                          <span style={{ fontSize: 10, color: '#fff', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {video.propietarioNombre || video.propietarioEmail}
                          </span>
                        </div>
                      )}

                      {/* Icono play centrado */}
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <Play size={44} color="rgba(255,255,255,0.85)" fill="rgba(255,255,255,0.85)" />
                      </div>

                      {/* Footer con nombre + botones */}
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{obtenerNombre(video)}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>{formatearFecha(obtenerFecha(video))}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          {duracion ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 5px', borderRadius: 5 }}>
                              {formatearDuracion(duracion)}
                            </span>
                          ) : null}
                          <button onClick={e => { e.stopPropagation(); descargar(video); }}
                            style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Descargar">
                            <DownloadCloud size={11} color="#fff" />
                          </button>
                          {video.esPropietario !== false && (
                            <button onClick={e => { e.stopPropagation(); abrirCompartir(video); }}
                              style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Compartir">
                              <Share2 size={11} color="#fff" />
                            </button>
                          )}
                          {puedeEliminar && (
                            <button onClick={e => { e.stopPropagation(); eliminar(video.id); }}
                              style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(239,68,68,0.8)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Eliminar">
                              <Trash2 size={11} color="#fff" />
                            </button>
                          )}
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

      {/* Reproductor */}
      {videoActivo && (
        <VideoPlayer
          videoId={videoActivo.id}
          nombreOriginal={videoActivo.nombreOriginal}
          onCerrar={() => setVideoActivo(null)}
        />
      )}

      {/* Modal compartir */}
      {modalCompartir && (
        <div onClick={() => setModalCompartir(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#1f2937', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Compartir video</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9ca3af' }}>{obtenerNombre(modalCompartir.video)}</p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={emailCompartir} onChange={e => setEmailCompartir(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && enviarCompartir()}
                placeholder="Email del destinatario"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #374151', background: '#111827', color: '#fff', fontSize: 14, outline: 'none' }} />
              <button onClick={enviarCompartir}
                style={{ padding: '9px 16px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                Compartir
              </button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d1d5db', marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={puedeEscribir} onChange={e => setPuedeEscribir(e.target.checked)} />
              Permitir eliminar/reemplazar (permiso w)
            </label>

            {errorCompartir && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 12px' }}>{errorCompartir}</p>}

            {modalCompartir.permisos.length > 0 && (
              <>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>Con acceso:</p>
                {modalCompartir.permisos.map((p: any) => (
                  <div key={p.destinatarioId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #374151' }}>
                    <div>
                      <span style={{ fontSize: 13 }}>{p.nombreDestinatario}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{p.emailDestinatario}</span>
                      <span style={{ fontSize: 11, color: '#a78bfa', marginLeft: 8 }}>{p.puedeEscribir ? 'rw-' : 'r--'}</span>
                    </div>
                    <button onClick={() => revocarAcceso(modalCompartir.video.id, p.destinatarioId)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>
                      Revocar
                    </button>
                  </div>
                ))}
              </>
            )}

            <button onClick={() => setModalCompartir(null)}
              style={{ marginTop: 20, width: '100%', padding: '9px', borderRadius: 8, background: '#374151', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoGallery;
