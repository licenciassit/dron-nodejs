import cv, { VideoCapture, VideoWriter } from '@u4/opencv4nodejs';
import * as fs from 'fs-extra';
import * as path from 'path';

// CONFIGURACIÓN OPTIMIZADA PARA RASPBERRY PI
export const CONFIG = {
  FRAME_WIDTH: 160,
  FRAME_HEIGHT: 120,
  MIN_AREA: 50,
  MAX_AREA: 30000,
  PERSON_PERCENTILE: 30,
  FIRE_THRESHOLD_ABS: 255,
  FPS: 10,
  RETENTION_DAYS: 3,
  PROCESS_EVERY_N_FRAMES: 2,
};

// CONFIGURACIÓN DE TELEGRAM (DUAL: Alta y Baja Calidad)
export const TELEGRAM_CONFIG = {
  highQuality: {
    enabled: false, // Cambiar a true para habilitar alertas HQ
    botToken: '', // Token del bot de Telegram HQ (obtener de @BotFather)
    chatId: '', // ID del chat HQ (obtener de @userinfobot)
    cooldownSeconds: 30, // Tiempo mínimo entre alertas del mismo tipo (segundos)
  },
  lowQuality: {
    enabled: false, // Cambiar a true para habilitar alertas LQ
    botToken: '', // Token del bot de Telegram LQ (puede ser el mismo bot)
    chatId: '', // ID del chat LQ (puede ser diferente chat/grupo)
    cooldownSeconds: 30, // Tiempo mínimo entre alertas del mismo tipo (segundos)
  },
};

export const VIDEO_DIRS = {
  THERMAL: 'videos',
  RGB: 'videos_rgb',
};

/**
 * Asegura que los directorios de video existan
 */
export function ensureVideoDirectories(): void {
  fs.ensureDirSync(VIDEO_DIRS.THERMAL);
  fs.ensureDirSync(VIDEO_DIRS.RGB);
}

/**
 * Elimina archivos antiguos de una carpeta según días de retención
 */
export function deleteOldFiles(folder: string, retentionDays: number = CONFIG.RETENTION_DAYS): void {
  if (!fs.existsSync(folder)) return;
  
  const now = Date.now();
  const files = fs.readdirSync(folder);
  
  files.forEach((file) => {
    const filePath = path.join(folder, file);
    try {
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) return;
      
      const fileAge = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      
      if (fileAge > retentionDays) {
        console.log(`🗑 Borrando: ${filePath}`);
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      // Ignorar errores
    }
  });
}

/**
 * Busca una cámara USB disponible
 */
export function findUsbCamera(maxIndex: number = 5): number {
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

/**
 * Calcula el percentil de un array de números
 */
export function percentile(array: number[], p: number): number {
  const sorted = array.slice().sort((a, b) => a - b);
  const index = Math.floor((p / 100) * sorted.length);
  return sorted[index];
}

/**
 * Inicializa una cámara con la configuración especificada
 */
export function initCamera(
  cameraIndex: number,
  width: number = CONFIG.FRAME_WIDTH,
  height: number = CONFIG.FRAME_HEIGHT,
  fps: number = CONFIG.FPS
): VideoCapture {
  const cap = new cv.VideoCapture(cameraIndex);
  cap.set(cv.CAP_PROP_FRAME_WIDTH, width);
  cap.set(cv.CAP_PROP_FRAME_HEIGHT, height);
  cap.set(cv.CAP_PROP_FPS, fps);
  return cap;
}

/**
 * Verifica que la cámara funcione correctamente
 */
export function testCamera(cap: VideoCapture): boolean {
  const testFrame = cap.read();
  return !testFrame.empty;
}

/**
 * Crea un VideoWriter para guardar video
 */
export function createVideoWriter(
  outputPath: string,
  fps: number = CONFIG.FPS,
  width: number = CONFIG.FRAME_WIDTH,
  height: number = CONFIG.FRAME_HEIGHT
): VideoWriter {
  const fourcc = cv.VideoWriter.fourcc('MJPG');
  return new cv.VideoWriter(outputPath, fourcc, fps, new cv.Size(width, height));
}

/**
 * Genera un timestamp formateado para nombres de archivo
 */
export function generateTimestamp(): string {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15).replace('T', '_');
}

/**
 * Crea la ruta completa para un archivo de video
 */
export function createVideoPath(directory: string, prefix: string): string {
  const timestamp = generateTimestamp();
  return path.join(directory, `${prefix}_${timestamp}.avi`);
}

// ==================== PUNTO DE EJECUCIÓN PRINCIPAL ====================
// Este es el módulo padre que controla la ejecución de los módulos hijos

import { main as mainDetectorTermico } from './detector-termico';
import { sendShutdownMessage } from './telegram';

/**
 * Función principal del módulo padre
 * Controla la ejecución de los módulos hijos
 */
async function main(): Promise<void> {
  console.log('🚀 Iniciando sistema desde módulo padre (camara.ts)...\n');
  
  // Ejecutar detector térmico (módulo hijo)
  await mainDetectorTermico();
}

// Manejo de señales de sistema
process.on('SIGINT', async () => {
  console.log('\n⚠️ Deteniendo sistema...');
  await sendShutdownMessage();
  process.exit(0);
});

// Ejecutar sistema
if (require.main === module) {
  main().catch(console.error);
}
