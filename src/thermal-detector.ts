import cv from '@u4/opencv4nodejs';
import * as fs from 'fs-extra';
import * as path from 'path';

// CONFIGURACIÓN OPTIMIZADA PARA RASPBERRY PI
const FRAME_WIDTH: number = 160;
const FRAME_HEIGHT: number = 120;
const MIN_AREA: number = 50;
const MAX_AREA: number = 30000;
const PERSON_PERCENTILE: number = 30;
const FIRE_THRESHOLD_ABS: number = 255;
const FPS: number = 10;
const RETENTION_DAYS: number = 3;
const PROCESS_EVERY_N_FRAMES: number = 2;

const VIDEO_DIR_THERMAL: string = 'videos';
const VIDEO_DIR_RGB: string = 'videos_rgb';

fs.ensureDirSync(VIDEO_DIR_THERMAL);
fs.ensureDirSync(VIDEO_DIR_RGB);

function deleteOldFiles(folder: string): void {
  if (!fs.existsSync(folder)) return;
  
  const now = Date.now();
  const files = fs.readdirSync(folder);
  
  files.forEach((file) => {
    const filePath = path.join(folder, file);
    try {
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) return;
      
      const fileAge = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      
      if (fileAge > RETENTION_DAYS) {
        console.log(`🗑 Borrando: ${filePath}`);
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      // Ignorar errores
    }
  });
}

function findUsbCamera(maxIndex: number = 5): number {
  for (let i = 0; i < maxIndex; i++) {
    try {
      const cap = new cv.VideoCapture(i);
      const frame = cap.read();
      
      if (!frame.empty) {
        cap.release();
        console.log(`✅ Cámara en /dev/video${i}`);
        return i;
      }
      cap.release();
    } catch (e) {
      continue;
    }
  }
  console.log('⚠️ No se detectó cámara, usando índice 0');
  return 0;
}

function percentile(array: number[], p: number): number {
  const sorted = array.slice().sort((a, b) => a - b);
  const index = Math.floor((p / 100) * sorted.length);
  return sorted[index];
}

async function main(): Promise<void> {
  console.log('🔥 Iniciando sistema de detección térmica...');
  
  deleteOldFiles(VIDEO_DIR_THERMAL);
  deleteOldFiles(VIDEO_DIR_RGB);

  console.log('📹 Buscando cámaras...');
  const thermalIndex = findUsbCamera();
  
  const capThermal = new cv.VideoCapture(thermalIndex);
  capThermal.set(cv.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH);
  capThermal.set(cv.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT);
  capThermal.set(cv.CAP_PROP_FPS, FPS);

  const testFrame = capThermal.read();
  if (testFrame.empty) {
    console.log('❌ No se pudo abrir la cámara térmica.');
    capThermal.release();
    return;
  }

  console.log('✅ Cámara térmica OK');

  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15).replace('T', '_');
  const thermalPath = path.join(VIDEO_DIR_THERMAL, `thermal_${timestamp}.avi`);

  const fourcc = cv.VideoWriter.fourcc('MJPG');
  const outThermal = new cv.VideoWriter(thermalPath, fourcc, FPS, new cv.Size(FRAME_WIDTH, FRAME_HEIGHT));

  console.log(`🎥 Grabando en: ${thermalPath}`);
  console.log('📊 Presiona Ctrl+C para detener');

  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  let frameCount: number = 0;

  while (true) {
    try {
      const frameThermal = capThermal.read();

      if (frameThermal.empty) {
        console.log('⚠️ Frame vacío, reintentando...');
        continue;
      }

      frameCount++;

      // Procesar solo cada N frames
      if (frameCount % PROCESS_EVERY_N_FRAMES !== 0) {
        outThermal.write(frameThermal);
        continue;
      }

      const gray = frameThermal.cvtColor(cv.COLOR_BGR2GRAY);
      const heatmap = gray.applyColorMap(cv.COLORMAP_JET);
      
      const channels = heatmap.splitChannels();
      const red = channels[2];

      const redData = red.getDataAsArray().flat();
      const personThresh = percentile(redData, PERSON_PERCENTILE);

      const maskPerson = red.threshold(personThresh, 255, cv.THRESH_BINARY);
      const maskFire = red.threshold(FIRE_THRESHOLD_ABS, 255, cv.THRESH_BINARY);

      const maskPersonProcessed = maskPerson
        .morphologyEx(kernel, cv.MORPH_OPEN, new cv.Point2(-1, -1), 1)
        .morphologyEx(kernel, cv.MORPH_DILATE, new cv.Point2(-1, -1), 1);
      
      const maskFireProcessed = maskFire
        .morphologyEx(kernel, cv.MORPH_OPEN, new cv.Point2(-1, -1), 1)
        .morphologyEx(kernel, cv.MORPH_DILATE, new cv.Point2(-1, -1), 1);

      const out = heatmap.copy();

      // Detectar incendios
      const contoursFire = maskFireProcessed.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      contoursFire.forEach((contour) => {
        const area = contour.area;
        if (area < MIN_AREA) return;

        const rect = contour.boundingRect();
        out.drawRectangle(
          new cv.Point2(rect.x, rect.y),
          new cv.Point2(rect.x + rect.width, rect.y + rect.height),
          new cv.Vec3(0, 0, 255),
          2
        );
        out.putText(
          'Incendio',
          new cv.Point2(rect.x, rect.y - 6),
          cv.FONT_HERSHEY_SIMPLEX,
          0.4,
          new cv.Vec3(0, 0, 255),
          1
        );
        console.log(`🔥 INCENDIO! Área: ${area.toFixed(0)}px`);
      });

      // Detectar personas
      const contoursPerson = maskPersonProcessed.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      contoursPerson.forEach((contour) => {
        const area = contour.area;
        if (area < MIN_AREA || area > MAX_AREA) return;

        const rect = contour.boundingRect();
        const aspect = rect.height / (rect.width + 1e-6);
        if (aspect < 0.7) return;

        out.drawRectangle(
          new cv.Point2(rect.x, rect.y),
          new cv.Point2(rect.x + rect.width, rect.y + rect.height),
          new cv.Vec3(0, 255, 0),
          2
        );
        out.putText(
          'Persona',
          new cv.Point2(rect.x, rect.y - 6),
          cv.FONT_HERSHEY_SIMPLEX,
          0.4,
          new cv.Vec3(0, 255, 0),
          1
        );
        console.log(`👤 Persona! Área: ${area.toFixed(0)}px`);
      });

      outThermal.write(out);

      if (frameCount % 100 === 0) {
        console.log(`📹 Frames procesados: ${frameCount}`);
      }

    } catch (error) {
      console.error('❌ Error en loop:', error);
      break;
    }
  }

  capThermal.release();
  outThermal.release();
  
  console.log('✅ Grabación finalizada');
}

process.on('SIGINT', () => {
  console.log('\n⚠️ Deteniendo sistema...');
  process.exit(0);
});

main().catch(console.error);