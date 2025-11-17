import cv, { Mat } from '@u4/opencv4nodejs';
import {
  CONFIG,
  TELEGRAM_CONFIG,
  VIDEO_DIRS,
  ensureVideoDirectories,
  deleteOldFiles,
  findUsbCamera,
  percentile,
  initCamera,
  testCamera,
  createVideoWriter,
  createVideoPath,
} from './camara';
import {
  initTelegramBots,
  sendPersonAlert,
  sendFireAlert,
  sendStartupMessage,
  sendShutdownMessage,
} from './telegram';

/**
 * Función principal del detector térmico
 * EXPORTADA para ser llamada desde el módulo padre (camara.ts)
 */
export async function main(): Promise<void> {
  console.log('🔥 Iniciando sistema de detección térmica...');
  
  // Inicializar bots de Telegram (Alta y Baja calidad)
  initTelegramBots(TELEGRAM_CONFIG);
  await sendStartupMessage();
  
  // Preparar directorios
  ensureVideoDirectories();
  deleteOldFiles(VIDEO_DIRS.THERMAL);
  deleteOldFiles(VIDEO_DIRS.RGB);

  // Inicializar cámara térmica
  console.log('📹 Buscando cámaras...');
  const thermalIndex = findUsbCamera();
  const capThermal = initCamera(thermalIndex);

  if (!testCamera(capThermal)) {
    console.log('❌ No se pudo abrir la cámara térmica.');
    capThermal.release();
    return;
  }

  console.log('✅ Cámara térmica OK');

  // Configurar grabación
  const thermalPath = createVideoPath(VIDEO_DIRS.THERMAL, 'thermal');
  const outThermal = createVideoWriter(thermalPath);

  console.log(`🎥 Grabando en: ${thermalPath}`);
  console.log('📊 Presiona Ctrl+C para detener');

  // Preparar kernel para procesamiento morfológico
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  let frameCount: number = 0;

  // Loop principal de procesamiento
  while (true) {
    try {
      const frameThermal = capThermal.read();

      if (frameThermal.empty) {
        console.log('⚠️ Frame vacío, reintentando...');
        continue;
      }

      frameCount++;

      // Procesar solo cada N frames
      if (frameCount % CONFIG.PROCESS_EVERY_N_FRAMES !== 0) {
        outThermal.write(frameThermal);
        continue;
      }

      // Convertir a escala de grises y aplicar mapa de calor
      const gray = frameThermal.cvtColor(cv.COLOR_BGR2GRAY);
      const heatmap = gray.applyColorMap(cv.COLORMAP_JET);
      
      // Extraer canal rojo para detección
      const channels = heatmap.splitChannels();
      const red = channels[2];

      // Calcular umbral dinámico para personas
      const redData = red.getDataAsArray().flat();
      const personThresh = percentile(redData, CONFIG.PERSON_PERCENTILE);

      // Crear máscaras
      const maskPerson = red.threshold(personThresh, 255, cv.THRESH_BINARY);
      const maskFire = red.threshold(CONFIG.FIRE_THRESHOLD_ABS, 255, cv.THRESH_BINARY);

      // Procesamiento morfológico
      const maskPersonProcessed = maskPerson
        .morphologyEx(kernel, cv.MORPH_OPEN, new cv.Point2(-1, -1), 1)
        .morphologyEx(kernel, cv.MORPH_DILATE, new cv.Point2(-1, -1), 1);
      
      const maskFireProcessed = maskFire
        .morphologyEx(kernel, cv.MORPH_OPEN, new cv.Point2(-1, -1), 1)
        .morphologyEx(kernel, cv.MORPH_DILATE, new cv.Point2(-1, -1), 1);

      const out = heatmap.copy();

      // Detectar incendios
      await detectFire(maskFireProcessed, out);

      // Detectar personas
      await detectPerson(maskPersonProcessed, out);

      // Guardar frame procesado
      outThermal.write(out);

      if (frameCount % 100 === 0) {
        console.log(`📹 Frames procesados: ${frameCount}`);
      }

    } catch (error) {
      console.error('❌ Error en loop:', error);
      break;
    }
  }

  // Liberar recursos
  capThermal.release();
  outThermal.release();
  
  console.log('✅ Grabación finalizada');
}

/**
 * Detecta y marca incendios en la imagen
 */
async function detectFire(mask: Mat, output: Mat): Promise<void> {
  const contoursFire = mask.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  for (const contour of contoursFire) {
    const area = contour.area;
    if (area < CONFIG.MIN_AREA) continue;

    const rect = contour.boundingRect();
    output.drawRectangle(
      new cv.Point2(rect.x, rect.y),
      new cv.Point2(rect.x + rect.width, rect.y + rect.height),
      new cv.Vec3(0, 0, 255),
      2
    );
    output.putText(
      'Incendio',
      new cv.Point2(rect.x, rect.y - 6),
      cv.FONT_HERSHEY_SIMPLEX,
      0.4,
      new cv.Vec3(0, 0, 255),
      1
    );
    console.log(`🔥 INCENDIO! Área: ${area.toFixed(0)}px`);
    
    // Enviar alerta a Telegram
    await sendFireAlert(output, area);
  }
}

/**
 * Detecta y marca personas en la imagen
 */
async function detectPerson(mask: Mat, output: Mat): Promise<void> {
  const contoursPerson = mask.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  for (const contour of contoursPerson) {
    const area = contour.area;
    if (area < CONFIG.MIN_AREA || area > CONFIG.MAX_AREA) continue;

    const rect = contour.boundingRect();
    const aspect = rect.height / (rect.width + 1e-6);
    if (aspect < 0.7) continue;

    output.drawRectangle(
      new cv.Point2(rect.x, rect.y),
      new cv.Point2(rect.x + rect.width, rect.y + rect.height),
      new cv.Vec3(0, 255, 0),
      2
    );
    output.putText(
      'Persona',
      new cv.Point2(rect.x, rect.y - 6),
      cv.FONT_HERSHEY_SIMPLEX,
      0.4,
      new cv.Vec3(0, 255, 0),
      1
    );
    console.log(`👤 Persona! Área: ${area.toFixed(0)}px`);
    
    // Enviar alerta a Telegram
    await sendPersonAlert(output, area);
  }
}

// Módulo hijo - se ejecuta desde camara.ts (módulo padre)
