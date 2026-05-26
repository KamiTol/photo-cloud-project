import { useEffect, useState } from 'react';
import axios from 'axios';

function App() {
  const [fotos, setFotos] = useState<any[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [subiendo, setSubiendo] = useState(false);

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
    setSubiendo(true);

    // Subir cada archivo en paralelo, incluyendo la fecha de mtime local
    const uploads = Array.from(files).map(async (file) => {
      const formData = new FormData();
      formData.append('archivo', file);
      // Enviar la mtime local como fallback: ms desde epoch
      formData.append('fechaArchivo', String(file.lastModified));
      return axios.post('http://localhost:3000/api/media/upload', formData);
    });

    try {
      await Promise.all(uploads);
      await cargarFotos(); // Recargar tras subir
    } catch (err) {
      console.error('Error subiendo archivos', err);
    } finally {
      setSubiendo(false);
      // limpiar input
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

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Mi Nube de Fotos</h1>
      
      {/* Barra de herramientas */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input type="file" multiple onChange={subirArchivo} accept="image/*,video/*" />
        <button onClick={borrarSeleccionados} disabled={seleccionados.size === 0}>
          Borrar Seleccionados ({seleccionados.size})
        </button>
        <div style={{ marginLeft: 'auto', color: '#666' }}>{subiendo ? 'Subiendo...' : ''}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '18px' }}>
        {fotos.map((foto) => (
          <div key={foto.id} onClick={() => toggleSeleccion(foto.id)} style={{ position: 'relative' }}>
            <div style={{
              border: seleccionados.has(foto.id) ? '2px solid #2563eb' : '1px solid #e5e7eb',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              cursor: 'pointer',
              background: '#fff'
            }}>
              <img
                src={`http://localhost:3000/api/media/thumb_${foto.id}`}
                alt={foto.nombreOriginal}
                style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
              />
              <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '13px', color: '#111', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{foto.nombreOriginal}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{new Date(foto.creadoEn).toLocaleString()}</div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                  <a style={{ fontSize: '13px', color: '#2563eb' }} href={`http://localhost:3000/api/media/${foto.id}/download`} target="_blank">Descargar</a>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;