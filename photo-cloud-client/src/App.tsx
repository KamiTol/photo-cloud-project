import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { zipSync } from 'fflate';
import { DownloadCloud, Trash2, Plus, X, Check } from 'lucide-react';

function App() {
  const [fotos, setFotos] = useState<any[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [subiendo, setSubiendo] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Array<{ id: string; file: File; preview: string; progress: number; uploaded: boolean; failed?: boolean }>>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { cargarFotos(); }, []);

  const cargarFotos = () => {
    axios.get('http://localhost:3000/api/media')
      .then(res => setFotos(res.data))
      .catch(err => console.error(err));
  };

  const toggleSeleccion = (id: string) => {
    const nuevos = new Set(seleccionados);
    nuevos.has(id) ? nuevos.delete(id) : nuevos.add(id);
    setSeleccionados(nuevos);
  };

  const subirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Preparar cola con previews
    const list = Array.from(files).map((file, idx) => ({
      id: `${Date.now()}_${idx}`,
      file,
      preview: URL.createObjectURL(file),
      progress: 0,
      uploaded: false
    }));
    setUploadQueue(list);
    setSubiendo(true);

    // Subir secuencialmente o en paralelo pero controlando progreso individual
    const promises = list.map((item, idx) => {
      const formData = new FormData();
      formData.append('archivo', item.file);
      formData.append('fechaArchivo', String(item.file.lastModified));

      return axios.post('http://localhost:3000/api/media/upload', formData, {
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || item.file.size;
          const percent = Math.round((progressEvent.loaded / total) * 100);
          setUploadQueue((prev) => prev.map((p) => p.id === item.id ? { ...p, progress: percent } : p));
          // marca como subido cuando el browser completó el envío de bytes
          if (percent >= 100) {
            setUploadQueue((prev) => prev.map((p) => p.id === item.id ? { ...p, progress: 100, uploaded: true } : p));
          }
        }
      }).then(() => {
        // confirmar éxito servidor
        setUploadQueue((prev) => prev.map((p) => p.id === item.id ? { ...p, progress: 100, uploaded: true, failed: false } : p));
      }).catch((err) => {
        console.error('Error subiendo', item.file.name, err);
        // marcar como fallido
        setUploadQueue((prev) => prev.map((p) => p.id === item.id ? { ...p, failed: true, uploaded: false } : p));
      });
    });

    try {
      await Promise.all(promises);
      await cargarFotos();
    } catch (err) {
      console.error('Error en la subida batch', err);
    } finally {
      setSubiendo(false);
      // liberar previews
      uploadQueue.forEach((u) => URL.revokeObjectURL(u.preview));
      setTimeout(() => setUploadQueue([]), 700);
      if (e.target) e.target.value = '';
    }
  };

  const borrarSeleccionados = async () => {
    for (const id of seleccionados) {
      await axios.delete(`http://localhost:3000/api/media/${id}`);
    }
    setSeleccionados(new Set());
    cargarFotos();
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const groupFotos = () => {
    // Agrupar fotos por YYYY-MM (orden descendente)
    const groups: Record<string, any[]> = {};
    fotos.forEach((f) => {
      const d = new Date(f.creadoEn);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });
    // Convertir a array ordenado por key desc (más reciente primero)
    const sortedKeys = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));
    return sortedKeys.map((k) => ({ key: k, fotos: groups[k] }));
  };

  const formatGroupTitle = (key: string) => {
    const [year, month] = key.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  };

  const toggleSelectAllInGroup = (groupKey: string, groupFotos: any[]) => {
    const nuevos = new Set(seleccionados);
    const allSelected = groupFotos.every((f) => nuevos.has(f.id));
    if (allSelected) {
      groupFotos.forEach((f) => nuevos.delete(f.id));
    } else {
      groupFotos.forEach((f) => nuevos.add(f.id));
    }
    setSeleccionados(nuevos);
  };

  const selectAllVisible = () => {
    const nuevos = new Set(seleccionados);
    fotos.forEach((f) => nuevos.add(f.id));
    setSeleccionados(nuevos);
  };

  const deselectAll = () => setSeleccionados(new Set());

  const buildZipBlob = (files: Array<{ filename: string; data: Uint8Array }>) => {
    const zipObject: Record<string, Uint8Array> = {};
    files.forEach((file) => {
      zipObject[file.filename] = file.data;
    });
    return new Blob([zipSync(zipObject)], { type: 'application/zip' });
  };

  const fetchFile = async (id: string) => {
    const res = await axios.get(`http://localhost:3000/api/media/${id}/download`, { responseType: 'arraybuffer' });
    const disposition = res.headers['content-disposition'] || '';
    let filename = `file_${id}`;
    const match = /filename=\"?([^\";]+)\"?/.exec(disposition);
    if (match) filename = match[1];
    const contentType = res.headers['content-type'] || 'application/octet-stream';
    return { id, filename, buffer: new Uint8Array(res.data), contentType };
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const downloadFilesAsZip = async (items: Array<{ id: string; filename?: string }>, zipName: string) => {
    try {
      const results = await Promise.all(items.map(async (item) => {
        const file = await fetchFile(item.id);
        return {
          filename: item.filename ?? file.filename,
          data: file.buffer
        };
      }));
      const zipBlob = buildZipBlob(results);
      downloadBlob(zipBlob, zipName);
    } catch (err) {
      console.error('Error creando ZIP', err);
    }
  };

  const downloadSingle = async (id: string, preferredName?: string) => {
    try {
      const file = await fetchFile(id);
      const name = preferredName ?? file.filename;
      const blob = new Blob([file.buffer], { type: file.contentType || 'application/octet-stream' });
      downloadBlob(blob, name);
    } catch (err) {
      console.error('Error descargando archivo', err);
    }
  };

  const downloadSelected = async () => {
    if (seleccionados.size === 0) return;
    const ids = Array.from(seleccionados);
    if (ids.length === 1) {
      const id = ids[0];
      const fotoObj = fotos.find((f) => f.id === id);
      await downloadSingle(id, fotoObj?.nombreOriginal);
    } else {
      await downloadFilesAsZip(ids.map((id) => ({ id })), 'seleccionados.zip');
    }
  };

  const downloadAll = async () => {
    if (fotos.length === 0) return;
    await downloadFilesAsZip(fotos.map((f) => ({ id: f.id, filename: f.nombreOriginal })), 'todas_las_fotos.zip');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Mi Nube de Fotos</h1>
      
      {/* Barra de herramientas */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={fileInputRef} type="file" multiple onChange={subirArchivo} accept="image/*,video/*" style={{ display: 'none' }} />
        <button onClick={triggerFileInput} title="Subir archivos" style={{
          width: 48, height: 48, borderRadius: '50%', background: '#2563eb', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} aria-label="Subir archivos"><Plus color="#fff" size={20} /></button>

        <button onClick={borrarSeleccionados} disabled={seleccionados.size === 0} title="Borrar seleccionados" style={{
          width: 40, height: 40, borderRadius: '50%', background: seleccionados.size ? '#ef4444' : '#f3f4f6', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} aria-label="Borrar seleccionados"><Trash2 color={seleccionados.size ? '#fff' : '#9ca3af'} size={16} /></button>

        <button onClick={downloadSelected} disabled={seleccionados.size === 0} title="Descargar seleccionados" style={{
          width: 40, height: 40, borderRadius: '50%', background: '#10b981', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} aria-label="Descargar seleccionados"><DownloadCloud color="#fff" size={16} /></button>

        <button onClick={downloadAll} disabled={fotos.length === 0} title="Descargar todo" style={{ padding: '8px 12px', borderRadius: 8, background: '#111827', color: '#fff', border: 'none' }}>Descargar Todo</button>

        <button onClick={() => setSelectionMode(!selectionMode)} title="Alternar modo selección" style={{ padding: '8px 12px', borderRadius: 8, background: selectionMode ? '#efefef' : '#e5e7eb', border: 'none' }}>{selectionMode ? 'Salir Selección' : 'Seleccionar'}</button>
        <button onClick={selectAllVisible} disabled={fotos.length === 0} title="Seleccionar todo" style={{ padding: '8px 12px', borderRadius: 8, background: '#f3f4f6', border: 'none' }}>Seleccionar Todo</button>
        <button onClick={deselectAll} disabled={seleccionados.size === 0} title="Deseleccionar todo" style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#f3f4f6' }}>Deseleccionar Todo</button>
        <div style={{ marginLeft: 'auto', color: '#666' }}>{subiendo ? 'Subiendo...' : ''}</div>
      </div>

      {/* Panel de progreso de subida */}
      {uploadQueue.length > 0 && (
        <div style={{ marginBottom: 18, padding: 12, borderRadius: 10, background: '#f8fafc', boxShadow: '0 4px 12px rgba(2,6,23,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {uploadQueue.slice(0, 4).map((u) => (
                <div key={u.id} style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: '#ddd', position: 'relative' }}>
                  <img src={u.preview} alt={u.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {u.failed && (
                    <div style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>!</div>
                  )}
                  {u.progress > 0 && u.progress < 100 && (
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, background: 'rgba(0,0,0,0.18)' }}>
                      <div style={{ height: '100%', width: `${u.progress}%`, background: '#2563eb' }} />
                    </div>
                  )}
                </div>
              ))}
              {uploadQueue.length > 4 && (
                <div style={{ width: 56, height: 56, borderRadius: 8, background: '#e6e9ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#374151' }}>+{uploadQueue.length - 4}</div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontWeight: 700 }}>{uploadQueue.filter(u => u.uploaded).length} de {uploadQueue.length} archivos</div>
                <div style={{ color: '#6b7280' }}>{uploadQueue.filter(u => u.uploaded).length} subidos</div>
                <div style={{ marginLeft: 'auto', color: '#111827', fontSize: 13 }}>{subiendo ? 'Subiendo...' : 'Procesando'}</div>
              </div>

              <div style={{ marginTop: 8, height: 8, background: '#e6e9ee', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(uploadQueue.reduce((s, u) => s + u.progress, 0) / Math.max(1, uploadQueue.length))}%`, background: '#2563eb', transition: 'width 240ms linear' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agrupar por mes/año */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {groupFotos().map((group) => (
          <div key={group.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              {selectionMode && (
                <input type="checkbox" checked={group.fotos.every((f: any) => seleccionados.has(f.id))} onChange={() => toggleSelectAllInGroup(group.key, group.fotos)} />
              )}
              <div style={{ fontWeight: 700, fontSize: 16 }}>{formatGroupTitle(group.key)} <span style={{ color: '#6b7280', fontWeight: 500, marginLeft: 8 }}>({group.fotos.length})</span></div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={() => {
                  if (group.fotos.length === 1) downloadSingle(group.fotos[0].id, group.fotos[0].nombreOriginal);
                  else downloadFilesAsZip(group.fotos.map((f:any) => ({ id: f.id, filename: f.nombreOriginal })), `${group.key}.zip`);
                }} style={{ fontSize: 13 }}>Descargar Grupo</button>
                <button onClick={() => { const nuevos = new Set(seleccionados); group.fotos.forEach((f:any)=>nuevos.add(f.id)); setSeleccionados(nuevos); }} style={{ fontSize: 13 }}>Seleccionar Grupo</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '18px' }}>
              {group.fotos.map((foto: any) => (
                <div key={foto.id} onClick={() => selectionMode ? toggleSeleccion(foto.id) : undefined} style={{ position: 'relative' }}>
                  <div style={{
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 6px 20px rgba(2,6,23,0.08)',
                    cursor: selectionMode ? 'pointer' : 'zoom-in',
                    background: '#fff',
                    position: 'relative',
                    transition: 'transform 180ms ease'
                  }} onMouseEnter={(e:any)=> e.currentTarget.style.transform='translateY(-6px)'} onMouseLeave={(e:any)=> e.currentTarget.style.transform='translateY(0)'}>
                    <div style={{ width: '100%', height: 160, background: '#111827', display: 'block' }}>
                      <img src={`http://localhost:3000/api/media/thumb/${foto.id}`} alt={foto.nombreOriginal} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>

                    {/* overlay bottom */}
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 12px', background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.6)', maxWidth: '70%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{foto.nombreOriginal}</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>{new Date(foto.creadoEn).toLocaleString()}</div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={(e)=>{ e.stopPropagation(); downloadSingle(foto.id, foto.nombreOriginal); }} title="Descargar" style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'#ffffffcc', display:'flex', alignItems:'center', justifyContent:'center' }}><DownloadCloud size={16} /></button>
                        <button onClick={(e)=>{ e.stopPropagation(); (async ()=>{ await axios.delete(`http://localhost:3000/api/media/${foto.id}`); cargarFotos(); })(); }} title="Borrar" style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'#ffffffcc', display:'flex', alignItems:'center', justifyContent:'center' }}><Trash2 size={16} /></button>
                      </div>
                    </div>

                    {/* selection badge */}
                    {selectionMode && (
                      <div style={{ position:'absolute', top:10, left:10, background: seleccionados.has(foto.id) ? '#2563eb' : 'rgba(255,255,255,0.9)', color: seleccionados.has(foto.id) ? '#fff' : '#111', width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 6px rgba(0,0,0,0.12)' }}>
                        {seleccionados.has(foto.id) ? <Check size={14} color="#fff" /> : <X size={12} color="#111" />}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
