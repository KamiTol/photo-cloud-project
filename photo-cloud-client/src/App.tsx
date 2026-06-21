import { useEffect, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { DownloadCloud, Trash2, Plus, X, Check, LogOut, Share2, UserCheck, Image, Play } from 'lucide-react';
import { api, setToken, getToken } from './api';
import VideoGallery from './components/VideoGallery';

// ── Imagen autenticada ────────────────────────────────────────────────────
// <img> no puede enviar headers, así que descargamos con axios y usamos Object URL
function AuthImage({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
  const [objectUrl, setObjectUrl] = useState<string>('');

  useEffect(() => {
    let revoked = false;
    let blobUrl = '';
    api.get(src, { responseType: 'blob' })
      .then(res => {
        if (revoked) return;
        blobUrl = URL.createObjectURL(res.data);
        setObjectUrl(blobUrl);
      })
      .catch(() => setObjectUrl(''));
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src]);

  return <img src={objectUrl} alt={alt} style={style} />;
}

// ── Pantalla de Login / Registro ──────────────────────────────────────────
function AuthScreen({ onLogin }: { onLogin: (token: string, nombre: string) => void }) {
  const [modo, setModo] = useState<'login' | 'register'>('login');
  const [nombre, setNombre] = useState('');
  const [email, setEmail]   = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]   = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      if (modo === 'register') {
        await api.post('/auth/register', { nombre, email, password });
        setModo('login');
        setError('Registro exitoso. Ahora inicia sesion.');
        setCargando(false);
        return;
      }
      const { data } = await api.post('/auth/login', { email, password });
      onLogin(data.token, data.usuario.nombre);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error de conexion.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827' }}>
      <div style={{ background: '#1f2937', padding: 36, borderRadius: 16, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <h1 style={{ color: '#fff', textAlign: 'center', marginBottom: 8, fontSize: 22 }}>Mi Nube de Fotos</h1>
        <p style={{ color: '#9ca3af', textAlign: 'center', marginBottom: 28, fontSize: 14 }}>
          {modo === 'login' ? 'Inicia sesion para continuar' : 'Crea tu cuenta'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {modo === 'register' && (
            <input
              placeholder="Nombre"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              required
              style={inputStyle}
            />
          )}
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            placeholder="Contrasena"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={inputStyle}
          />

          {error && (
            <p style={{ color: error.includes('exitoso') ? '#34d399' : '#f87171', fontSize: 13, margin: 0 }}>{error}</p>
          )}

          <button type="submit" disabled={cargando} style={btnPrimaryStyle}>
            {cargando ? 'Cargando...' : modo === 'login' ? 'Iniciar sesion' : 'Registrarse'}
          </button>
        </form>

        <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 20, fontSize: 13 }}>
          {modo === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button
            onClick={() => { setModo(modo === 'login' ? 'register' : 'login'); setError(''); }}
            style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 13 }}
          >
            {modo === 'login' ? 'Registrate' : 'Inicia sesion'}
          </button>
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 8, border: '1px solid #374151',
  background: '#111827', color: '#fff', fontSize: 14, outline: 'none',
};
const btnPrimaryStyle: React.CSSProperties = {
  padding: '11px', borderRadius: 8, background: '#2563eb', color: '#fff',
  border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 15,
};

// ── Barra de cuota ────────────────────────────────────────────────────────
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function BarraCuota({ cuota }: { cuota: { usoByte: number; cuotaMaximaBytes: number; porcentajeUso: number } }) {
  const color = cuota.porcentajeUso >= 90 ? '#ef4444' : cuota.porcentajeUso >= 70 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
      <div style={{ flex: 1, height: 6, background: '#374151', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${cuota.porcentajeUso}%`, background: color, transition: 'width 400ms' }} />
      </div>
      <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>
        {formatBytes(cuota.usoByte)} / {formatBytes(cuota.cuotaMaximaBytes)}
      </span>
    </div>
  );
}

// ── Galeria principal ─────────────────────────────────────────────────────
function Galeria({ nombreUsuario, onLogout }: { nombreUsuario: string; onLogout: () => void }) {
  const [fotos, setFotos] = useState<any[]>([]);
  const [cuota, setCuota] = useState<{ usoByte: number; cuotaMaximaBytes: number; porcentajeUso: number } | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [subiendo, setSubiendo] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Array<{ id: string; file: File; preview: string; progress: number; uploaded: boolean; failed?: boolean }>>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [vistaActiva, setVistaActiva] = useState<'fotos' | 'streaming'>('fotos');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Modal de compartir
  const [modalCompartir, setModalCompartir] = useState<{ foto: any; permisos: any[] } | null>(null);
  const [emailCompartir, setEmailCompartir] = useState('');
  const [puedeEscribir, setPuedeEscribir] = useState(false);
  const [errorCompartir, setErrorCompartir] = useState('');

  useEffect(() => {
    cargarFotos();
    cargarCuota();
    // Polling cada 30 s para detectar archivos compartidos sin necesidad de refresh
    const intervalo = setInterval(() => { cargarFotos(); cargarCuota(); }, 30_000);
    return () => clearInterval(intervalo);
  }, []);

  const cargarFotos = () => {
    api.get('/media')
      // Excluir videos — esos van solo en la pestaña Streaming
      .then(res => setFotos(res.data.filter((f: any) => !f.mimetype?.startsWith('video/'))))
      .catch(err => console.error(err));
  };

  const cargarCuota = () => {
    api.get('/usuarios/me')
      .then(res => setCuota(res.data.cuota))
      .catch(() => {});
  };

  const toggleSeleccion = (id: string) => {
    const nuevos = new Set(seleccionados);
    nuevos.has(id) ? nuevos.delete(id) : nuevos.add(id);
    setSeleccionados(nuevos);
  };

  const subirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const list = Array.from(files).map((file, idx) => ({
      id: `${Date.now()}_${idx}`, file,
      preview: URL.createObjectURL(file),
      progress: 0, uploaded: false,
    }));
    setUploadQueue(list);
    setSubiendo(true);

    const promises = list.map((item) => {
      const formData = new FormData();
      formData.append('archivo', item.file);
      formData.append('fechaArchivo', String(item.file.lastModified));

      return api.post('/media/upload', formData, {
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || item.file.size;
          const percent = Math.round((progressEvent.loaded / total) * 100);
          setUploadQueue(prev => prev.map(p => p.id === item.id ? { ...p, progress: percent, uploaded: percent >= 100 } : p));
        },
      }).then(() => {
        setUploadQueue(prev => prev.map(p => p.id === item.id ? { ...p, progress: 100, uploaded: true, failed: false } : p));
      }).catch(() => {
        setUploadQueue(prev => prev.map(p => p.id === item.id ? { ...p, failed: true, uploaded: false } : p));
      });
    });

    try {
      await Promise.all(promises);
      await cargarFotos();
      cargarCuota();
    } finally {
      setSubiendo(false);
      list.forEach(u => URL.revokeObjectURL(u.preview));
      setTimeout(() => setUploadQueue([]), 700);
      if (e.target) e.target.value = '';
    }
  };

  const borrarSeleccionados = async () => {
    for (const id of seleccionados) await api.delete(`/media/${id}`);
    setSeleccionados(new Set());
    cargarFotos();
    cargarCuota();
  };

  const groupFotos = () => {
    const groups: Record<string, any[]> = {};
    fotos.forEach(f => {
      const d = new Date(f.creadoEn);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });
    return Object.keys(groups).sort((a, b) => a < b ? 1 : -1).map(k => ({ key: k, fotos: groups[k] }));
  };

  const formatGroupTitle = (key: string) => {
    const [year, month] = key.split('-');
    return new Date(Number(year), Number(month) - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
  };

  const fetchFile = async (id: string) => {
    const res = await api.get(`/media/${id}/download`, { responseType: 'arraybuffer' });
    const disposition = res.headers['content-disposition'] || '';
    const match = /filename=\"?([^\";]+)\"?/.exec(disposition);
    return { filename: match ? match[1] : `file_${id}`, buffer: new Uint8Array(res.data), contentType: res.headers['content-type'] };
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  };

  const downloadSingle = async (id: string, name?: string) => {
    const file = await fetchFile(id);
    downloadBlob(new Blob([file.buffer], { type: file.contentType }), name ?? file.filename);
  };

  const downloadFilesAsZip = async (items: Array<{ id: string; filename?: string }>, zipName: string) => {
    const results = await Promise.all(items.map(async item => {
      const file = await fetchFile(item.id);
      return { filename: item.filename ?? file.filename, data: file.buffer };
    }));
    const zipObj: Record<string, Uint8Array> = {};
    results.forEach(r => { zipObj[r.filename] = r.data; });
    downloadBlob(new Blob([zipSync(zipObj)], { type: 'application/zip' }), zipName);
  };

  const downloadSelected = async () => {
    const ids = Array.from(seleccionados);
    if (ids.length === 1) await downloadSingle(ids[0], fotos.find(f => f.id === ids[0])?.nombreOriginal);
    else await downloadFilesAsZip(ids.map(id => ({ id })), 'seleccionados.zip');
  };

  const abrirModalCompartir = async (foto: any) => {
    setErrorCompartir('');
    setEmailCompartir('');
    setPuedeEscribir(false);
    try {
      const res = await api.get(`/media/${foto.id}/compartidos`);
      setModalCompartir({ foto, permisos: res.data });
    } catch {
      setModalCompartir({ foto, permisos: [] });
    }
  };

  const enviarCompartir = async () => {
    if (!modalCompartir || !emailCompartir.trim()) return;
    setErrorCompartir('');
    try {
      await api.post(`/media/${modalCompartir.foto.id}/compartir`, {
        email: emailCompartir.trim(),
        leer: true,
        escribir: puedeEscribir,
        ejecutar: false,
      });
      // Recargar permisos actuales
      const res = await api.get(`/media/${modalCompartir.foto.id}/compartidos`);
      setModalCompartir(prev => prev ? { ...prev, permisos: res.data } : null);
      setEmailCompartir('');
    } catch (err: any) {
      setErrorCompartir(err.response?.data?.error || 'Error al compartir.');
    }
  };

  const revocarAcceso = async (archivoId: string, usuarioId: string) => {
    await api.delete(`/media/${archivoId}/compartir/${usuarioId}`);
    const res = await api.get(`/media/${archivoId}/compartidos`);
    setModalCompartir(prev => prev ? { ...prev, permisos: res.data } : null);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', background: '#111827', minHeight: '100vh', color: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, flexShrink: 0 }}>Mi Nube de Fotos</h1>
        <span style={{ color: '#9ca3af', fontSize: 14, flexShrink: 0 }}>Hola, {nombreUsuario}</span>
        {cuota && <div style={{ flex: 1, minWidth: 180 }}><BarraCuota cuota={cuota} /></div>}
        <button onClick={onLogout} title="Cerrar sesion" style={{ marginLeft: 'auto', background: 'none', border: '1px solid #374151', color: '#9ca3af', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <LogOut size={14} /> Salir
        </button>
      </div>

      {/* Navegación por pestañas */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #374151' }}>
        <button
          onClick={() => setVistaActiva('fotos')}
          style={{
            padding: '10px 24px',
            border: 'none',
            borderBottom: vistaActiva === 'fotos' ? '2px solid #2563eb' : '2px solid transparent',
            background: 'none',
            fontWeight: vistaActiva === 'fotos' ? 700 : 400,
            color: vistaActiva === 'fotos' ? '#60a5fa' : '#6b7280',
            cursor: 'pointer',
            marginBottom: -2,
            fontSize: 15
          }}>
          📷 Galería de Fotos
        </button>
        <button
          onClick={() => setVistaActiva('streaming')}
          style={{
            padding: '10px 24px',
            border: 'none',
            borderBottom: vistaActiva === 'streaming' ? '2px solid #7c3aed' : '2px solid transparent',
            background: 'none',
            fontWeight: vistaActiva === 'streaming' ? 700 : 400,
            color: vistaActiva === 'streaming' ? '#a78bfa' : '#6b7280',
            cursor: 'pointer',
            marginBottom: -2,
            fontSize: 15
          }}>
          🎥 Streaming
        </button>
      </div>

      {vistaActiva === 'fotos' && (
        <div>
      
      {/* Barra de herramientas */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={fileInputRef} type="file" multiple onChange={subirArchivo} accept="image/*,video/*" style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} style={{ width: 48, height: 48, borderRadius: '50%', background: '#2563eb', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Plus color="#fff" size={20} />
        </button>
        <button onClick={borrarSeleccionados} disabled={seleccionados.size === 0} style={{ width: 40, height: 40, borderRadius: '50%', background: seleccionados.size ? '#ef4444' : '#374151', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Trash2 color={seleccionados.size ? '#fff' : '#6b7280'} size={16} />
        </button>
        <button onClick={downloadSelected} disabled={seleccionados.size === 0} style={{ width: 40, height: 40, borderRadius: '50%', background: '#10b981', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <DownloadCloud color="#fff" size={16} />
        </button>
        <button onClick={() => downloadFilesAsZip(fotos.map(f => ({ id: f.id, filename: f.nombreOriginal })), 'todas.zip')} disabled={fotos.length === 0} style={{ padding: '8px 12px', borderRadius: 8, background: '#1f2937', color: '#fff', border: '1px solid #374151', cursor: 'pointer' }}>Descargar Todo</button>
        <button onClick={() => setSelectionMode(!selectionMode)} style={{ padding: '8px 12px', borderRadius: 8, background: selectionMode ? '#2563eb' : '#1f2937', color: '#fff', border: '1px solid #374151', cursor: 'pointer' }}>{selectionMode ? 'Salir Seleccion' : 'Seleccionar'}</button>
        <div style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 13 }}>{subiendo ? 'Subiendo...' : ''}</div>
      </div>

      {/* Progreso de subida */}
      {uploadQueue.length > 0 && (
        <div style={{ marginBottom: 18, padding: 12, borderRadius: 10, background: '#1f2937' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {uploadQueue.slice(0, 4).map(u => (
                <div key={u.id} style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: '#374151', position: 'relative' }}>
                  <img src={u.preview} alt={u.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {u.progress > 0 && u.progress < 100 && (
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'rgba(0,0,0,0.3)' }}>
                      <div style={{ height: '100%', width: `${u.progress}%`, background: '#2563eb' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 700 }}>{uploadQueue.filter(u => u.uploaded).length} / {uploadQueue.length} archivos</div>
              <div style={{ marginTop: 6, height: 6, background: '#374151', borderRadius: 999 }}>
                <div style={{ height: '100%', width: `${Math.round(uploadQueue.reduce((s, u) => s + u.progress, 0) / Math.max(1, uploadQueue.length))}%`, background: '#2563eb', transition: 'width 200ms' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Galeria agrupada por mes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {groupFotos().map(group => (
          <div key={group.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#e5e7eb' }}>
                {formatGroupTitle(group.key)} <span style={{ color: '#6b7280', fontWeight: 400 }}>({group.fotos.length})</span>
              </div>
              <button onClick={() => downloadFilesAsZip(group.fotos.map((f: any) => ({ id: f.id, filename: f.nombreOriginal })), `${group.key}.zip`)} style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#1f2937', color: '#9ca3af', border: '1px solid #374151', cursor: 'pointer' }}>
                Descargar grupo
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {group.fotos.map((foto: any) => (
                <div key={foto.id} onClick={() => selectionMode && toggleSeleccion(foto.id)}
                  style={{ borderRadius: 12, overflow: 'hidden', background: '#1f2937', position: 'relative', cursor: selectionMode ? 'pointer' : 'default', boxShadow: seleccionados.has(foto.id) ? '0 0 0 3px #2563eb' : 'none', transition: 'box-shadow 120ms' }}>
                  <div style={{ width: '100%', height: 150, background: '#374151' }}>
                    <AuthImage src={`/media/thumb/${foto.id}`} alt={foto.nombreOriginal}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ position: 'absolute', inset: 0, bottom: 0, top: 'auto', padding: '8px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{foto.nombreOriginal}</div>
                      <div style={{ color: '#d1d5db', fontSize: 11 }}>{new Date(foto.creadoEn).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={e => { e.stopPropagation(); downloadSingle(foto.id, foto.nombreOriginal); }} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Descargar">
                        <DownloadCloud size={13} color="#fff" />
                      </button>
                      {foto.esPropietario !== false && (
                        <button onClick={e => { e.stopPropagation(); abrirModalCompartir(foto); }} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Compartir">
                          <Share2 size={13} color="#fff" />
                        </button>
                      )}
                      {foto.esPropietario !== false && (
                        <button onClick={e => { e.stopPropagation(); api.delete(`/media/${foto.id}`).then(() => { cargarFotos(); cargarCuota(); }); }} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Eliminar">
                          <Trash2 size={13} color="#fff" />
                        </button>
                      )}
                    </div>
                  </div>
                  {selectionMode && (
                    <div style={{ position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: '50%', background: seleccionados.has(foto.id) ? '#2563eb' : 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {seleccionados.has(foto.id) ? <Check size={13} color="#fff" /> : <X size={11} color="#111" />}
                    </div>
                  )}
                  {foto.esPropietario === false && (
                    <div title={`Compartido por ${foto.propietarioNombre || foto.propietarioEmail}`} style={{ position: 'absolute', top: 8, right: 8, background: '#7c3aed', borderRadius: 20, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <UserCheck size={11} color="#fff" />
                      <span style={{ fontSize: 10, color: '#fff', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{foto.propietarioNombre || foto.propietarioEmail}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {fotos.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6b7280', paddingTop: 60 }}>
            <p>No hay archivos aun. Sube tu primera foto.</p>
          </div>
        )}
      </div>

      {/* Modal compartir */}
      {modalCompartir && (
        <div onClick={() => setModalCompartir(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1f2937', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Compartir archivo</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9ca3af' }}>{modalCompartir.foto.nombreOriginal}</p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={emailCompartir}
                onChange={e => setEmailCompartir(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && enviarCompartir()}
                placeholder="Email del destinatario"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #374151', background: '#111827', color: '#fff', fontSize: 14, outline: 'none' }}
              />
              <button onClick={enviarCompartir} style={{ padding: '9px 16px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
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
                      <span style={{ fontSize: 11, color: '#60a5fa', marginLeft: 8 }}>{p.puedeEscribir ? 'rw-' : 'r--'}</span>
                    </div>
                    <button onClick={() => revocarAcceso(modalCompartir.foto.id, p.destinatarioId)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>
                      Revocar
                    </button>
                  </div>
                ))}
              </>
            )}

            <button onClick={() => setModalCompartir(null)} style={{ marginTop: 20, width: '100%', padding: '9px', borderRadius: 8, background: '#374151', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
        </div>
      )}

      {vistaActiva === 'streaming' && (
        <VideoGallery />
      )}
    </div>
  );
}

// ── App raiz ──────────────────────────────────────────────────────────────
const SESSION_KEY = 'pc_session';

export default function App() {
  // Recuperar sesión previa de sessionStorage (sobrevive refresh, no cierre de pestaña)
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } })();

  const [token, setTokenState] = useState<string | null>(saved?.token ?? null);
  const [nombre, setNombre]    = useState<string>(saved?.nombre ?? '');

  // Sincronizar token en memoria al montar (necesario para el interceptor de axios)
  if (saved?.token && !getToken()) setToken(saved.token);

  const handleLogin = (t: string, n: string) => {
    setToken(t);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: t, nombre: n }));
    setTokenState(t);
    setNombre(n);
  };

  const handleLogout = () => {
    setToken(null);
    sessionStorage.removeItem(SESSION_KEY);
    setTokenState(null);
    setNombre('');
  };

  if (!token) return <AuthScreen onLogin={handleLogin} />;
  return <Galeria nombreUsuario={nombre} onLogout={handleLogout} />;
}
