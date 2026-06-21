import { useEffect, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { DownloadCloud, Trash2, Plus, X, Check, LogOut, Share2, UserCheck, Image, Play } from 'lucide-react';
import { api, setToken, getToken } from './api';
import VideoGallery from './components/VideoGallery';

// ── Imagen autenticada ────────────────────────────────────────────────────
// <img> no puede enviar headers, así que descargamos con axios y usamos Object URL
function AuthImage({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked = false;
    let blobUrl = '';
    setError(false);
    setObjectUrl(null);
    api.get(src, { responseType: 'blob' })
      .then(res => {
        if (revoked) return;
        blobUrl = URL.createObjectURL(res.data);
        setObjectUrl(blobUrl);
      })
      .catch(() => { if (!revoked) setError(true); });
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src]);

  if (error) {
    // Placeholder cuando la imagen no carga
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#374151', color: '#6b7280', fontSize: 28 }}>
        🖼
      </div>
    );
  }
  if (!objectUrl) {
    // Skeleton mientras carga
    return <div style={{ ...style, background: 'linear-gradient(90deg,#1f2937 25%,#374151 50%,#1f2937 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />;
  }
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

// ── Utilidades de sync ────────────────────────────────────────────────────
const EXTS_MEDIA = new Set([
  '.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff','.heic',
  '.mp4','.mov','.avi','.mkv','.webm','.m4v','.3gp',
]);

async function sha256Browser(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function* leerArchivos(dir: FileSystemDirectoryHandle, ruta = ''): AsyncGenerator<{ file: File; ruta: string }> {
  for await (const [nombre, handle] of (dir as any).entries()) {
    if (handle.kind === 'file') {
      const ext = '.' + nombre.split('.').pop()?.toLowerCase();
      if (EXTS_MEDIA.has(ext)) {
        const file = await (handle as FileSystemFileHandle).getFile();
        yield { file, ruta: ruta ? `${ruta}/${nombre}` : nombre };
      }
    } else {
      yield* leerArchivos(handle as FileSystemDirectoryHandle, ruta ? `${ruta}/${nombre}` : nombre);
    }
  }
}

function formatTiempo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

// ── IndexedDB helpers para persistir el FileSystemDirectoryHandle ─────────
function abrirSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('photo-cloud-sync', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('config');
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
async function guardarHandleIDB(handle: FileSystemDirectoryHandle) {
  const db = await abrirSyncDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('config', 'readwrite');
    tx.objectStore('config').put(handle, 'dirHandle');
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
async function cargarHandleIDB(): Promise<FileSystemDirectoryHandle | null> {
  const db = await abrirSyncDB();
  return new Promise(resolve => {
    const tx  = db.transaction('config', 'readonly');
    const req = tx.objectStore('config').get('dirHandle');
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror   = () => resolve(null);
  });
}

// ── Panel de Sincronización ───────────────────────────────────────────────
function PanelSync(_: { email: string }) {
  const [dirHandle, setDirHandle]     = useState<FileSystemDirectoryHandle | null>(null);
  const [dirPermisoOk, setDirPermisoOk] = useState(false);
  const [horaSync, setHoraSync]       = useState('02:00');
  const [autoSync, setAutoSync]       = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [ultimoSync, setUltimoSync] = useState<Date | null>(null);
  const [countdown, setCountdown]   = useState(0);
  const [progreso, setProgreso]     = useState(0);
  const [archivoActual, setActual]  = useState('');
  const [log, setLog]               = useState<string[]>([]);
  const [resumen, setResumen]       = useState('');

  const syncingRef    = useRef(false);
  const timerSyncRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerCountRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextSyncAt    = useRef(0);
  const horaSyncRef   = useRef('02:00');

  useEffect(() => { horaSyncRef.current = horaSync; }, [horaSync]);

  // ── Cargar configuración persistida al montar ─────────────────────────
  useEffect(() => {
    const hora = localStorage.getItem('sync-hora') ?? '02:00';
    const auto = localStorage.getItem('sync-auto') === 'true';
    setHoraSync(hora);
    horaSyncRef.current = hora;

    cargarHandleIDB().then(async (handle) => {
      if (!handle) return;
      setDirHandle(handle);
      try {
        const perm = await (handle as any).queryPermission({ mode: 'read' });
        if (perm === 'granted') {
          setDirPermisoOk(true);
          if (auto) {
            setAutoSync(true);
            iniciarScheduler(handle, hora);
          }
        }
        // Si perm === 'prompt': mostramos el handle pero pedimos reautorización
      } catch { /* browser no soporta queryPermission */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLog = (msg: string) => setLog(p => [...p.slice(-80), msg]);

  // ── Núcleo de sync ────────────────────────────────────────────────────
  const ejecutarSync = async (handle: FileSystemDirectoryHandle) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setProgreso(0);
    setLog([]);
    setResumen('');
    addLog(`📂 ${handle.name}`);

    let hashes: Set<string>;
    try {
      const res = await api.get<string[]>('/media/hashes');
      hashes = new Set(res.data);
      addLog(`☁ En servidor: ${hashes.size} archivos`);
    } catch {
      addLog('✗ Error conectando con el servidor.');
      syncingRef.current = false;
      setSyncing(false);
      return;
    }

    const archivos: Array<{ file: File; ruta: string }> = [];
    for await (const entry of leerArchivos(handle)) archivos.push(entry);
    addLog(`🔍 Archivos locales: ${archivos.length}`);

    let subidos = 0, saltados = 0, errores = 0;
    for (let i = 0; i < archivos.length; i++) {
      const { file, ruta } = archivos[i];
      setProgreso(Math.round((i / archivos.length) * 100));
      setActual(ruta);
      try {
        const hash = await sha256Browser(file);
        if (hashes.has(hash)) { saltados++; continue; }
        const form = new FormData();
        form.append('archivo', file, file.name);
        form.append('fechaArchivo', String(file.lastModified));
        await api.post('/media/upload', form);
        hashes.add(hash);
        subidos++;
        addLog(`  ✓ ${ruta}`);
      } catch (err: any) {
        errores++;
        addLog(`  ✗ ${ruta}: ${err?.response?.data?.error ?? err.message}`);
      }
    }

    setProgreso(100);
    setUltimoSync(new Date());
    const txt = `✅ ${subidos} subidos · ${saltados} sin cambios${errores ? ` · ${errores} errores` : ''}`;
    setResumen(txt);
    addLog(`\n${txt}`);
    syncingRef.current = false;
    setSyncing(false);
  };

  // ── Scheduler ─────────────────────────────────────────────────────────
  const detenerScheduler = () => {
    if (timerSyncRef.current)  clearTimeout(timerSyncRef.current);
    if (timerCountRef.current) clearInterval(timerCountRef.current);
    timerSyncRef.current = null;
    timerCountRef.current = null;
  };

  // Calcula ms hasta la próxima ocurrencia de HH:MM (hoy o mañana)
  const msHastaHora = (hhmm: string): number => {
    const [hh, mm] = hhmm.split(':').map(Number);
    const ahora = new Date();
    const objetivo = new Date(ahora);
    objetivo.setHours(hh, mm, 0, 0);
    if (objetivo <= ahora) objetivo.setDate(objetivo.getDate() + 1);
    return objetivo.getTime() - ahora.getTime();
  };

  const iniciarScheduler = (handle: FileSystemDirectoryHandle, hhmm: string) => {
    detenerScheduler();
    const ms = msHastaHora(hhmm);
    nextSyncAt.current = Date.now() + ms;
    setCountdown(ms);

    timerCountRef.current = setInterval(() => {
      const left = nextSyncAt.current - Date.now();
      setCountdown(left > 0 ? left : 0);
    }, 1000);

    const tick = () => {
      ejecutarSync(handle);
      // Programar para el mismo horario al día siguiente
      const nextMs = msHastaHora(horaSyncRef.current);
      nextSyncAt.current = Date.now() + nextMs;
      timerSyncRef.current = setTimeout(tick, nextMs);
    };
    timerSyncRef.current = setTimeout(tick, ms);
  };

  const toggleAutoSync = () => {
    if (autoSync) {
      detenerScheduler();
      setAutoSync(false);
      setCountdown(0);
      localStorage.setItem('sync-auto', 'false');
    } else {
      if (!dirHandle || !dirPermisoOk) return;
      setAutoSync(true);
      localStorage.setItem('sync-auto', 'true');
      iniciarScheduler(dirHandle, horaSync);
    }
  };

  const reautorizarCarpeta = async () => {
    if (!dirHandle) return;
    try {
      await (dirHandle as any).requestPermission({ mode: 'read' });
      setDirPermisoOk(true);
      if (autoSync) iniciarScheduler(dirHandle, horaSync);
    } catch { /* cancelado */ }
  };

  // Reiniciar scheduler si cambia la hora mientras está activo
  useEffect(() => {
    if (autoSync && dirHandle) iniciarScheduler(dirHandle, horaSync);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horaSync]);

  const seleccionarCarpeta = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
      setDirHandle(handle);
      setDirPermisoOk(true);
      detenerScheduler();
      setAutoSync(false);
      localStorage.setItem('sync-auto', 'false');
      setLog([]);
      setResumen('');
      await guardarHandleIDB(handle);
    } catch { /* cancelado */ }
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <h2 style={{ color: '#34d399', marginBottom: 4, fontSize: 18 }}>⚙ Sincronización de Carpeta</h2>
      <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
        Selecciona una carpeta y decide si sincronizar manualmente o de forma automática cada cierto tiempo.
      </p>

      {/* Carpeta */}
      <div style={{ background: '#1f2937', borderRadius: 12, padding: 18, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Carpeta a sincronizar</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={seleccionarCarpeta}
            style={{ padding: '10px 18px', borderRadius: 8, background: '#374151', color: '#fff', border: '1px solid #4b5563', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            📁 {dirHandle ? 'Cambiar carpeta' : 'Seleccionar carpeta'}
          </button>
          {dirHandle && !dirPermisoOk && (
            <button onClick={reautorizarCarpeta}
              style={{ padding: '10px 18px', borderRadius: 8, background: '#92400e', color: '#fff', border: '1px solid #b45309', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              🔓 Reautorizar acceso
            </button>
          )}
          {dirHandle
            ? <span style={{ fontSize: 14, color: dirPermisoOk ? '#34d399' : '#f59e0b', fontWeight: 600 }}>
                📂 {dirHandle.name}{!dirPermisoOk ? ' (sin permiso)' : ''}
              </span>
            : <span style={{ fontSize: 13, color: '#6b7280' }}>Ninguna seleccionada</span>}
        </div>
      </div>

      {/* Controles */}
      {dirHandle && dirPermisoOk && (
        <>
          {/* Sync manual */}
          <div style={{ background: '#1f2937', borderRadius: 12, padding: 18, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Sincronización manual</div>
            <button onClick={() => ejecutarSync(dirHandle)} disabled={syncing}
              style={{ padding: '11px 24px', borderRadius: 9, fontWeight: 700, fontSize: 14, background: syncing ? '#374151' : '#2563eb', color: '#fff', border: 'none', cursor: syncing ? 'not-allowed' : 'pointer' }}>
              {syncing ? '⏳ Sincronizando...' : '🔄 Sincronizar ahora'}
            </button>
            {ultimoSync && <span style={{ marginLeft: 14, fontSize: 12, color: '#6b7280' }}>Último: {ultimoSync.toLocaleTimeString()}</span>}
          </div>

          {/* Auto-sync */}
          <div style={{ background: '#1f2937', borderRadius: 12, padding: 18, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Sincronización automática diaria</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, color: '#d1d5db', display: 'flex', alignItems: 'center', gap: 8 }}>
                Sincronizar a las
                <input
                  type="time" value={horaSync}
                  onChange={e => { setHoraSync(e.target.value); localStorage.setItem('sync-hora', e.target.value); }}
                  style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #374151', background: '#111827', color: '#fff', fontSize: 14, colorScheme: 'dark' }}
                />
              </label>

              <button onClick={toggleAutoSync}
                style={{ padding: '9px 20px', borderRadius: 9, fontWeight: 700, fontSize: 13, background: autoSync ? '#7f1d1d' : '#065f46', color: '#fff', border: 'none', cursor: 'pointer' }}>
                {autoSync ? '⏹ Detener' : '▶ Activar'}
              </button>

              {autoSync && countdown > 0 && (
                <span style={{ fontSize: 13, color: '#9ca3af' }}>
                  Próximo sync en <strong style={{ color: '#34d399' }}>{formatTiempo(countdown)}</strong>
                </span>
              )}
            </div>
            {autoSync && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                Sincronizará todos los días a las {horaSync} mientras la app esté abierta.
              </div>
            )}
          </div>
        </>
      )}

      {/* Progreso */}
      {syncing && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {archivoActual || 'Consultando servidor...'}
          </div>
          <div style={{ height: 5, background: '#374151', borderRadius: 999 }}>
            <div style={{ height: '100%', width: `${progreso}%`, background: '#10b981', borderRadius: 999, transition: 'width 200ms' }} />
          </div>
        </div>
      )}

      {/* Resumen */}
      {resumen && !syncing && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 13, color: '#6ee7b7', marginBottom: 12 }}>
          {resumen}
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div style={{ background: '#0f172a', borderRadius: 10, padding: 12, maxHeight: 220, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', lineHeight: 1.7 }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
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
  const [vistaActiva, setVistaActiva] = useState<'fotos' | 'streaming' | 'sync'>('fotos');
  const [fotoAbierta, setFotoAbierta] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Modal de compartir
  const [modalCompartir, setModalCompartir] = useState<{ foto: any; permisos: any[] } | null>(null);
  const [emailCompartir, setEmailCompartir] = useState('');
  const [puedeEscribir, setPuedeEscribir] = useState(false);
  const [errorCompartir, setErrorCompartir] = useState('');

  useEffect(() => {
    cargarFotos();
    cargarCuota();
    const intervalo = setInterval(() => { cargarFotos(); cargarCuota(); }, 30_000);
    return () => clearInterval(intervalo);
  }, []);

  // Navegación con teclado en el lightbox
  useEffect(() => {
    if (!fotoAbierta) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setFotoAbierta(null); return; }
      const idx = fotos.findIndex((f: any) => f.id === fotoAbierta.id);
      if (e.key === 'ArrowRight' && idx < fotos.length - 1) setFotoAbierta(fotos[idx + 1]);
      if (e.key === 'ArrowLeft'  && idx > 0)                setFotoAbierta(fotos[idx - 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fotoAbierta, fotos]);

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
        <button
          onClick={() => setVistaActiva('sync')}
          style={{
            padding: '10px 24px',
            border: 'none',
            borderBottom: vistaActiva === 'sync' ? '2px solid #10b981' : '2px solid transparent',
            background: 'none',
            fontWeight: vistaActiva === 'sync' ? 700 : 400,
            color: vistaActiva === 'sync' ? '#34d399' : '#6b7280',
            cursor: 'pointer',
            marginBottom: -2,
            fontSize: 15
          }}>
          ⚙ Sync Automático
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
                <div key={foto.id} onClick={() => selectionMode ? toggleSeleccion(foto.id) : setFotoAbierta(foto)}
                  style={{ borderRadius: 12, overflow: 'hidden', background: '#1f2937', position: 'relative', cursor: 'pointer', boxShadow: seleccionados.has(foto.id) ? '0 0 0 3px #2563eb' : 'none', transition: 'box-shadow 120ms' }}>
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

      {/* ── Lightbox ──────────────────────────────────────────────────── */}
      {fotoAbierta && (() => {
        const idx = fotos.findIndex((f: any) => f.id === fotoAbierta.id);
        return (
          <div onClick={() => setFotoAbierta(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>

            {/* Imagen */}
            <div onClick={e => e.stopPropagation()}
              style={{ maxWidth: '90vw', maxHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AuthImage
                src={`/media/${fotoAbierta.id}`}
                alt={fotoAbierta.nombreOriginal}
                style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }}
              />
            </div>

            {/* Nombre + fecha */}
            <div style={{ marginTop: 14, textAlign: 'center', color: '#d1d5db', fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{fotoAbierta.nombreOriginal}</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>{new Date(fotoAbierta.creadoEn).toLocaleString()}</div>
            </div>

            {/* Flechas */}
            {idx > 0 && (
              <button onClick={e => { e.stopPropagation(); setFotoAbierta(fotos[idx - 1]); }}
                style={{ position: 'fixed', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 28, width: 48, height: 48, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ‹
              </button>
            )}
            {idx < fotos.length - 1 && (
              <button onClick={e => { e.stopPropagation(); setFotoAbierta(fotos[idx + 1]); }}
                style={{ position: 'fixed', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 28, width: 48, height: 48, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ›
              </button>
            )}

            {/* Botón cerrar */}
            <button onClick={() => setFotoAbierta(null)}
              style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 20, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer' }}>
              ×
            </button>

            {/* Descarga rápida */}
            <button onClick={e => { e.stopPropagation(); downloadSingle(fotoAbierta.id, fotoAbierta.nombreOriginal); }}
              style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <DownloadCloud size={14} /> Descargar
            </button>
          </div>
        );
      })()}
        </div>
      )}

      <div style={{ display: vistaActiva === 'streaming' ? 'block' : 'none' }}>
        <VideoGallery />
      </div>

      <div style={{ display: vistaActiva === 'sync' ? 'block' : 'none' }}>
        <PanelSync email={nombreUsuario} />
      </div>
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
