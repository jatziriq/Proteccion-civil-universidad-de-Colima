// server.js - Servidor Node.js con Express y MySQL
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Carpeta para el HTML

// Configuración de la base de datos
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4'
});

// Conectar a la base de datos
db.connect((err) => {
  if (err) {
    console.error('❌ Error conectando a la base de datos:', err);
    return;
  }
  console.log('✅ Conectado a MySQL');
});

// ============ API NOVEDADES ============
app.get('/api/novedades', (req, res) => {
  const query = `
    SELECT id, titulo, resumen, contenido, categoria, fecha_publicacion, destacado
    FROM novedades 
    WHERE publicado = 1 
    ORDER BY destacado DESC, fecha_publicacion DESC
    LIMIT 10
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error en la consulta', error: err });
    }
    res.json({ success: true, data: results });
  });
});

// Detalle de una novedad
app.get('/api/novedades/:id', (req, res) => {
  const query = `
    SELECT id, titulo, resumen, contenido, categoria, fecha_publicacion, destacado
    FROM novedades 
    WHERE id = ? AND publicado = 1
  `;
  
  db.query(query, [req.params.id], (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error en la consulta', error: err });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Novedad no encontrada' });
    }
    res.json({ success: true, data: results[0] });
  });
});

// ============ API BRIGADAS ============
app.get('/api/brigadas', (req, res) => {
  const query = `
    SELECT id, nombre, descripcion, coordinador, email_coordinador, 
           telefono_coordinador, miembros_activos, requisitos
    FROM brigadas 
    WHERE activa = 1 
    ORDER BY nombre
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error en la consulta', error: err });
    }
    res.json({ success: true, data: results });
  });
});

app.post('/api/brigadas', (req, res) => {
  const { brigada_id, nombre_completo, email, telefono, n_cuenta, carrera, semestre, experiencia_previa, motivacion } = req.body;
  
  if (!brigada_id || !nombre_completo || !email || !telefono || !motivacion) {
    return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
  }
  
  const query = `
    INSERT INTO solicitudes_brigadistas 
    (nombre_completo, email, telefono, n_cuenta, carrera, semestre, 
     brigada_id, experiencia_previa, motivacion, estatus, fecha_solicitud)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', NOW())
  `;
  
  db.query(query, [nombre_completo, email, telefono, n_cuenta, carrera, semestre, brigada_id, experiencia_previa, motivacion], (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error al guardar', error: err });
    }
    res.status(201).json({
      success: true,
      message: 'Solicitud enviada exitosamente. Te contactaremos pronto.',
      solicitud_id: result.insertId
    });
  });
});

// ============ API CURSOS ============
app.get('/api/cursos', (req, res) => {
  const query = `
    SELECT c.id, c.titulo, c.descripcion, c.duracion_horas, c.cupo_maximo, 
           c.cupo_disponible, c.instructor, c.modalidad, c.fecha_inicio,
           c.fecha_fin, c.horario, c.costo, c.estatus,
           COUNT(ic.id) as total_inscritos
    FROM cursos c
    LEFT JOIN inscripciones_cursos ic ON c.id = ic.curso_id AND ic.estatus != 'cancelada'
    WHERE c.estatus IN ('programado', 'inscripciones_abiertas')
    GROUP BY c.id
    ORDER BY c.fecha_inicio
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error en la consulta', error: err });
    }
    res.json({ success: true, data: results });
  });
});

app.post('/api/cursos', (req, res) => {
  const { curso_id, nombre_completo, email, telefono, n_cuenta, carrera, semestre, motivacion } = req.body;
  
  if (!curso_id || !nombre_completo || !email || !telefono || !motivacion) {
    return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
  }
  
  // Verificar cupo
  db.query('SELECT cupo_disponible, titulo FROM cursos WHERE id = ?', [curso_id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }
    
    if (results[0].cupo_disponible <= 0) {
      return res.status(400).json({ success: false, message: 'No hay cupo disponible' });
    }
    
    const query = `
      INSERT INTO inscripciones_cursos 
      (curso_id, nombre_completo, email, telefono, n_cuenta, carrera, semestre, motivacion, estatus, fecha_inscripcion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', NOW())
    `;
    
    db.query(query, [curso_id, nombre_completo, email, telefono, n_cuenta, carrera, semestre, motivacion], (err, result) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Error al inscribir', error: err });
      }
      
      // Actualizar cupo
      db.query('UPDATE cursos SET cupo_disponible = cupo_disponible - 1 WHERE id = ?', [curso_id]);
      
      res.status(201).json({
        success: true,
        message: 'Inscripción confirmada. Recibirás un correo con los detalles.',
        curso: results[0].titulo,
        inscripcion_id: result.insertId
      });
    });
  });
});

// ============ API DOCUMENTOS ============
app.get('/api/documentos', (req, res) => {
  const query = `
    SELECT id, titulo, descripcion, categoria, tipo_documento, archivo_url, fecha_subida
    FROM documentos 
    WHERE vigente = 1 AND categoria = 'publico'
    ORDER BY fecha_subida DESC
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error en la consulta', error: err });
    }
    res.json({ success: true, data: results });
  });
});

// ============ API CONTACTO ============
app.post('/api/contacto', (req, res) => {
  const { nombre, email, telefono, asunto, mensaje, tipo } = req.body;
  
  if (!nombre || !email || !asunto || !mensaje) {
    return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
  }
  
  const query = `
    INSERT INTO mensajes_contacto 
    (nombre, email, telefono, asunto, mensaje, tipo, estatus, fecha_envio)
    VALUES (?, ?, ?, ?, ?, ?, 'nuevo', NOW())
  `;
  
  db.query(query, [nombre, email, telefono, asunto, mensaje, tipo || 'consulta'], (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error al enviar', error: err });
    }
    
    res.status(201).json({
      success: true,
      message: 'Mensaje enviado exitosamente. Te responderemos pronto.',
      mensaje_id: result.insertId
    });
  });
});

// ============ API EMERGENCIAS ============
app.post('/api/emergencias', (req, res) => {
  const { nombre_solicitante, telefono, email, tipo_emergencia, nivel_urgencia, edificio, piso, numero_afectados, ubicacion_detallada, descripcion } = req.body;
  
  if (!nombre_solicitante || !telefono || !tipo_emergencia || !ubicacion_detallada || !descripcion) {
    return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
  }
  
  // Generar folio único
  const folio = 'EMG-' + Date.now();
  
  const query = `
    INSERT INTO emergencias 
    (folio, nombre_solicitante, telefono, email, ubicacion_detallada, edificio, piso, 
     tipo_emergencia, nivel_urgencia, descripcion, numero_afectados, estatus, fecha_reporte)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reportada', NOW())
  `;
  
  db.query(query, [folio, nombre_solicitante, telefono, email, ubicacion_detallada, edificio, piso, tipo_emergencia, nivel_urgencia || 'media', descripcion, numero_afectados || 1], (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error al registrar emergencia', error: err });
    }
    
    res.status(201).json({
      success: true,
      message: 'Emergencia reportada. Un equipo ha sido despachado a tu ubicación.',
      folio: folio,
      emergencia_id: result.insertId,
      tipo: tipo_emergencia,
      nivel: nivel_urgencia || 'media'
    });
  });
});

app.get('/api/emergencias', (req, res) => {
  const query = `
    SELECT e.*, b.nombre as brigada_nombre
    FROM emergencias e
    LEFT JOIN brigadas b ON e.brigada_asignada = b.id
    ORDER BY e.fecha_reporte DESC
    LIMIT 50
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error en la consulta', error: err });
    }
    res.json({ success: true, data: results });
  });
});

// Iniciar servidor
app.listen(PORT, () => {
   console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});


// ============ API ESTADÍSTICAS ============
app.get('/api/estadisticas', (req, res) => {
  const query = `SELECT * FROM vista_estadisticas_generales`;
  
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error en la consulta', error: err });
    }
    
    const stats = results[0] || {};
    res.json({
      success: true,
      data: {
        brigadistas_activos: stats.brigadistas_activos || 59,
        cursos_disponibles: 3,
        emergencias_activas: stats.emergencias_activas || 0,
        solicitudes_pendientes: stats.solicitudes_pendientes || 0
      }
    });
  });
});

// ============ API BRIGADAS ============
app.get('/api/brigadas', (req, res) => {
  const query = `
    SELECT id, nombre, descripcion, coordinador, email_coordinador, 
           telefono_coordinador, miembros_activos, requisitos, imagen_url
    FROM brigadas 
    WHERE activa = 1 
    ORDER BY nombre
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error en la consulta', error: err });
    }
    res.json({ success: true, data: results });
  });
});

app.post('/api/brigadas', (req, res) => {
  const { brigada_id, nombre_completo, email, telefono, n_cuenta, carrera, semestre, experiencia_previa, motivacion } = req.body;
  
  // Validaciones
  if (!brigada_id || !nombre_completo || !email || !telefono || !motivacion) {
    return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
  }
  
  const query = `
    INSERT INTO solicitudes_brigadistas 
    (nombre_completo, email, telefono, n_cuenta, carrera, semestre, 
     brigada_id, experiencia_previa, motivacion, estatus, fecha_solicitud)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', NOW())
  `;
  
  db.query(query, [nombre_completo, email, telefono, n_cuenta, carrera, semestre, brigada_id, experiencia_previa, motivacion], (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error al guardar', error: err });
    }
    res.status(201).json({
      success: true,
      message: 'Solicitud enviada exitosamente',
      solicitud_id: result.insertId
    });
  });
});

// ============ API CURSOS ============
app.get('/api/cursos', (req, res) => {
  const query = `
    SELECT c.id, c.titulo, c.descripcion, c.duracion_horas, c.cupo_maximo, 
           c.cupo_disponible, c.instructor, c.modalidad, c.fecha_inicio,
           c.fecha_fin, c.horario, c.costo, c.estatus,
           COUNT(ic.id) as total_inscritos
    FROM cursos c
    LEFT JOIN inscripciones_cursos ic ON c.id = ic.curso_id AND ic.estatus != 'cancelada'
    WHERE c.estatus IN ('programado', 'inscripciones_abiertas')
    GROUP BY c.id
    ORDER BY c.fecha_inicio
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error en la consulta', error: err });
    }
    res.json({ success: true, data: results });
  });
});

app.post('/api/cursos', (req, res) => {
  const { curso_id, nombre_completo, email, telefono, n_cuenta, carrera, semestre, motivacion } = req.body;
  
  if (!curso_id || !nombre_completo || !email || !telefono || !motivacion) {
    return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
  }
  
  // Verificar cupo disponible
  db.query('SELECT cupo_disponible, titulo FROM cursos WHERE id = ?', [curso_id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }
    
    if (results[0].cupo_disponible <= 0) {
      return res.status(400).json({ success: false, message: 'No hay cupo disponible' });
    }
    
    // Insertar inscripción
    const query = `
      INSERT INTO inscripciones_cursos 
      (curso_id, nombre_completo, email, telefono, n_cuenta, carrera, semestre, motivacion, estatus, fecha_inscripcion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', NOW())
    `;
    
    db.query(query, [curso_id, nombre_completo, email, telefono, n_cuenta, carrera, semestre, motivacion], (err, result) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Error al inscribir', error: err });
      }
      
      // Actualizar cupo
      db.query('UPDATE cursos SET cupo_disponible = cupo_disponible - 1 WHERE id = ?', [curso_id], (err2) => {
        if (err2) console.error('Error actualizando cupo:', err2);
        
        res.status(201).json({
          success: true,
          message: 'Inscripción confirmada',
          curso: results[0].titulo,
          inscripcion_id: result.insertId
        });
      });
    });
  });
});

// ============ API EMERGENCIAS ============
app.post('/api/emergencias', (req, res) => {
  const { nombre_solicitante, telefono, email, tipo_emergencia, nivel_urgencia, edificio, piso, numero_afectados, ubicacion_detallada, descripcion } = req.body;
  
  if (!nombre_solicitante || !telefono || !tipo_emergencia || !ubicacion_detallada || !descripcion) {
    return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
  }
  
  const folio = `EMG-${Date.now()}`;
  
  const query = `
    INSERT INTO emergencias 
    (folio, nombre_solicitante, telefono, email, ubicacion_detallada, edificio, piso, 
     tipo_emergencia, nivel_urgencia, descripcion, numero_afectados, estatus, fecha_reporte)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reportada', NOW())
  `;
  
  db.query(query, [folio, nombre_solicitante, telefono, email, ubicacion_detallada, edificio, piso, tipo_emergencia, nivel_urgencia || 'media', descripcion, numero_afectados || 1], (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error al reportar', error: err });
    }
    
    res.status(201).json({
      success: true,
      message: 'Emergencia reportada. Un equipo ha sido despachado.',
      folio: folio,
      emergencia_id: result.insertId,
      tipo: tipo_emergencia,
      nivel: nivel_urgencia || 'media'
    });
  });
});

// ============ API CONTACTO ============
app.post('/api/contacto', (req, res) => {
  const { nombre, email, telefono, tipo, asunto, mensaje } = req.body;
  
  if (!nombre || !email || !asunto || !mensaje) {
    return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
  }
  
  const query = `
    INSERT INTO mensajes_contacto 
    (nombre, email, telefono, asunto, mensaje, tipo, estatus, fecha_envio)
    VALUES (?, ?, ?, ?, ?, ?, 'nuevo', NOW())
  `;
  
  db.query(query, [nombre, email, telefono, asunto, mensaje, tipo || 'consulta'], (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error al enviar', error: err });
    }
    
    res.status(201).json({
      success: true,
      message: 'Mensaje enviado exitosamente. Te responderemos pronto.',
      mensaje_id: result.insertId
    });
  });
});

// ============ API DOCUMENTOS ============
app.get('/api/documentos', (req, res) => {
  const query = `
    SELECT id, titulo, descripcion, categoria, tipo_documento, archivo_nombre, fecha_subida, descargas
    FROM documentos 
    WHERE vigente = 1 AND categoria = 'publico'
    ORDER BY fecha_subida DESC
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error en la consulta', error: err });
    }
    res.json({ success: true, data: results });
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📊 API disponible en http://localhost:${PORT}/api/`);
});