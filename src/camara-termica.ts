import cv, { Mat } from '@u4/opencv4nodejs';
import {
  sendPersonAlert,
  sendFireAlert,
} from './telegram';

// ==================== MÓDULO DE EXPORTADORES/ENDPOINTS ====================
// Este módulo solo exporta funciones para ser usadas por el controlador

/**
 * Detecta y marca incendios en la imagen
 * @param mask Máscara binaria de detección de fuego
 * @param output Imagen de salida donde se dibujarán las detecciones
 * @param minArea Área mínima para considerar una detección válida
 */
export async function detectFire(mask: Mat, output: Mat, minArea: number): Promise<void> {
  const contoursFire = mask.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  for (const contour of contoursFire) {
    const area = contour.area;
    if (area < minArea) continue;

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
 * @param mask Máscara binaria de detección de personas
 * @param output Imagen de salida donde se dibujarán las detecciones
 * @param minArea Área mínima para considerar una detección válida
 * @param maxArea Área máxima para considerar una detección válida
 */
export async function detectPerson(mask: Mat, output: Mat, minArea: number, maxArea: number): Promise<void> {
  const contoursPerson = mask.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  for (const contour of contoursPerson) {
    const area = contour.area;
    if (area < minArea || area > maxArea) continue;

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
    console.log(`� Persona! Área: ${area.toFixed(0)}px`);
    
    // Enviar alerta a Telegram
    await sendPersonAlert(output, area);
  }
}

/**
 * Procesa un frame térmico y realiza las detecciones
 * @param frameThermal Frame original de la cámara térmica
 * @param kernel Kernel morfológico para procesamiento
 * @param personPercentile Percentil para umbral dinámico de personas
 * @param fireThreshold Umbral absoluto para detección de fuego
 * @param minArea Área mínima de detección
 * @param maxArea Área máxima de detección
 * @returns Frame procesado con detecciones marcadas
 */
export async function processFrame(
  frameThermal: Mat,
  kernel: Mat,
  personPercentile: number,
  fireThreshold: number,
  minArea: number,
  maxArea: number,
  percentileFn: (array: number[], p: number) => number
): Promise<Mat> {
  // Convertir a escala de grises y aplicar mapa de calor
  const gray = frameThermal.cvtColor(cv.COLOR_BGR2GRAY);
  const heatmap = gray.applyColorMap(cv.COLORMAP_JET);
  
  // Extraer canal rojo para detección
  const channels = heatmap.splitChannels();
  const red = channels[2];

  // Calcular umbral dinámico para personas
  const redData = red.getDataAsArray().flat();
  const personThresh = percentileFn(redData, personPercentile);

  // Crear máscaras
  const maskPerson = red.threshold(personThresh, 255, cv.THRESH_BINARY);
  const maskFire = red.threshold(fireThreshold, 255, cv.THRESH_BINARY);

  // Procesamiento morfológico
  const maskPersonProcessed = maskPerson
    .morphologyEx(kernel, cv.MORPH_OPEN, new cv.Point2(-1, -1), 1)
    .morphologyEx(kernel, cv.MORPH_DILATE, new cv.Point2(-1, -1), 1);
  
  const maskFireProcessed = maskFire
    .morphologyEx(kernel, cv.MORPH_OPEN, new cv.Point2(-1, -1), 1)
    .morphologyEx(kernel, cv.MORPH_DILATE, new cv.Point2(-1, -1), 1);

  const out = heatmap.copy();

  // Detectar incendios
  await detectFire(maskFireProcessed, out, minArea);

  // Detectar personas
  await detectPerson(maskPersonProcessed, out, minArea, maxArea);

  return out;
}

