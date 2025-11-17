import TelegramBot from 'node-telegram-bot-api';
import { Mat } from '@u4/opencv4nodejs';
import cv from '@u4/opencv4nodejs';
import * as fs from 'fs-extra';
import * as path from 'path';

// Configuración de un bot de Telegram
export interface TelegramBotConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  cooldownSeconds: number; // Tiempo mínimo entre alertas del mismo tipo
}

// Configuración dual de Telegram
export interface DualTelegramConfig {
  highQuality: TelegramBotConfig;
  lowQuality: TelegramBotConfig;
}

// Calidad de imagen
export type ImageQuality = 'high' | 'low';

// Tipos de detección
export type DetectionType = 'person' | 'fire';

// Estado de cooldown para evitar spam
interface CooldownState {
  person: number;
  fire: number;
}

// Bots y configuraciones
let botHQ: TelegramBot | null = null;
let botLQ: TelegramBot | null = null;
let configHQ: TelegramBotConfig | null = null;
let configLQ: TelegramBotConfig | null = null;

let lastAlertHQ: CooldownState = {
  person: 0,
  fire: 0,
};

let lastAlertLQ: CooldownState = {
  person: 0,
  fire: 0,
};

/**
 * Inicializa los bots de Telegram (alta y baja calidad)
 */
export function initTelegramBots(dualConfig: DualTelegramConfig): void {
  // Inicializar bot de alta calidad
  if (dualConfig.highQuality.enabled) {
    if (!dualConfig.highQuality.botToken || !dualConfig.highQuality.chatId) {
      console.warn('⚠️ Token o Chat ID de Telegram HQ no configurado');
    } else {
      try {
        botHQ = new TelegramBot(dualConfig.highQuality.botToken, { polling: false });
        configHQ = dualConfig.highQuality;
        console.log('✅ Bot de Telegram (Alta Calidad) inicializado');
      } catch (error) {
        console.error('❌ Error al inicializar bot HQ:', error);
      }
    }
  } else {
    console.log('📱 Telegram Alta Calidad deshabilitado');
  }

  // Inicializar bot de baja calidad
  if (dualConfig.lowQuality.enabled) {
    if (!dualConfig.lowQuality.botToken || !dualConfig.lowQuality.chatId) {
      console.warn('⚠️ Token o Chat ID de Telegram LQ no configurado');
    } else {
      try {
        botLQ = new TelegramBot(dualConfig.lowQuality.botToken, { polling: false });
        configLQ = dualConfig.lowQuality;
        console.log('✅ Bot de Telegram (Baja Calidad) inicializado');
      } catch (error) {
        console.error('❌ Error al inicializar bot LQ:', error);
      }
    }
  } else {
    console.log('📱 Telegram Baja Calidad deshabilitado');
  }
}

/**
 * Verifica si se puede enviar una alerta (respeta cooldown)
 */
function canSendAlert(type: DetectionType, quality: ImageQuality): boolean {
  const lastAlert = quality === 'high' ? lastAlertHQ : lastAlertLQ;
  const config = quality === 'high' ? configHQ : configLQ;
  
  if (!config) return false;
  
  const now = Date.now();
  const lastAlertTime = lastAlert[type];
  const cooldownMs = config.cooldownSeconds * 1000;
  
  return (now - lastAlertTime) >= cooldownMs;
}

/**
 * Actualiza el timestamp de la última alerta
 */
function updateLastAlert(type: DetectionType, quality: ImageQuality): void {
  const lastAlert = quality === 'high' ? lastAlertHQ : lastAlertLQ;
  lastAlert[type] = Date.now();
}

/**
 * Guarda un frame Mat de OpenCV como archivo temporal con calidad especificada
 */
async function saveFrameToTemp(frame: Mat, prefix: string, quality: ImageQuality): Promise<string> {
  const tempDir = path.join(process.cwd(), 'temp');
  await fs.ensureDir(tempDir);
  
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
  const filename = `${prefix}_${quality}_${timestamp}.jpg`;
  const filepath = path.join(tempDir, filename);
  
  if (quality === 'low') {
    // Redimensionar para baja calidad (50% de tamaño)
    const resized = frame.resize(frame.rows / 2, frame.cols / 2);
    cv.imwrite(filepath, resized);
  } else {
    // Alta calidad (original)
    cv.imwrite(filepath, frame);
  }
  
  return filepath;
}

/**
 * Elimina archivo temporal
 */
async function deleteTempFile(filepath: string): Promise<void> {
  try {
    await fs.unlink(filepath);
  } catch (error) {
    // Ignorar errores
  }
}

/**
 * Envía alerta de persona detectada con fotograma (a ambos bots si están habilitados)
 */
export async function sendPersonAlert(frame: Mat, area: number): Promise<void> {
  const message = `⚠️ *ADVERTENCIA: PERSONA DETECTADA*\n\n` +
                 `🕒 Hora: ${new Date().toLocaleString('es-ES')}\n` +
                 `📏 Área: ${area.toFixed(0)} px²`;

  // Enviar a bot de alta calidad
  if (botHQ && configHQ && configHQ.enabled) {
    if (canSendAlert('person', 'high')) {
      try {
        const filepath = await saveFrameToTemp(frame, 'person', 'high');
        await botHQ.sendPhoto(configHQ.chatId, filepath, {
          caption: message + '\n📸 *Alta Calidad*',
          parse_mode: 'Markdown'
        });
        await deleteTempFile(filepath);
        updateLastAlert('person', 'high');
        console.log('📱 Alerta de persona enviada a Telegram HQ');
      } catch (error) {
        console.error('❌ Error al enviar alerta HQ:', error);
      }
    } else {
      console.log('⏳ Alerta HQ de persona en cooldown');
    }
  }

  // Enviar a bot de baja calidad
  if (botLQ && configLQ && configLQ.enabled) {
    if (canSendAlert('person', 'low')) {
      try {
        const filepath = await saveFrameToTemp(frame, 'person', 'low');
        await botLQ.sendPhoto(configLQ.chatId, filepath, {
          caption: message + '\n📸 *Baja Calidad*',
          parse_mode: 'Markdown'
        });
        await deleteTempFile(filepath);
        updateLastAlert('person', 'low');
        console.log('📱 Alerta de persona enviada a Telegram LQ');
      } catch (error) {
        console.error('❌ Error al enviar alerta LQ:', error);
      }
    } else {
      console.log('⏳ Alerta LQ de persona en cooldown');
    }
  }
}

/**
 * Envía alerta de incendio detectado con fotograma (a ambos bots si están habilitados)
 */
export async function sendFireAlert(frame: Mat, area: number): Promise<void> {
  const message = `🔥 *ADVERTENCIA CRÍTICA: INCENDIO DETECTADO*\n\n` +
                 `🕒 Hora: ${new Date().toLocaleString('es-ES')}\n` +
                 `📏 Área: ${area.toFixed(0)} px²\n\n` +
                 `⚡ ¡ALERTA MÁXIMA!`;

  // Enviar a bot de alta calidad
  if (botHQ && configHQ && configHQ.enabled) {
    if (canSendAlert('fire', 'high')) {
      try {
        const filepath = await saveFrameToTemp(frame, 'fire', 'high');
        await botHQ.sendPhoto(configHQ.chatId, filepath, {
          caption: message + '\n� *Alta Calidad*',
          parse_mode: 'Markdown'
        });
        await deleteTempFile(filepath);
        updateLastAlert('fire', 'high');
        console.log('📱 Alerta de incendio enviada a Telegram HQ');
      } catch (error) {
        console.error('❌ Error al enviar alerta HQ:', error);
      }
    } else {
      console.log('⏳ Alerta HQ de incendio en cooldown');
    }
  }

  // Enviar a bot de baja calidad
  if (botLQ && configLQ && configLQ.enabled) {
    if (canSendAlert('fire', 'low')) {
      try {
        const filepath = await saveFrameToTemp(frame, 'fire', 'low');
        await botLQ.sendPhoto(configLQ.chatId, filepath, {
          caption: message + '\n📸 *Baja Calidad*',
          parse_mode: 'Markdown'
        });
        await deleteTempFile(filepath);
        updateLastAlert('fire', 'low');
        console.log('📱 Alerta de incendio enviada a Telegram LQ');
      } catch (error) {
        console.error('❌ Error al enviar alerta LQ:', error);
      }
    } else {
      console.log('⏳ Alerta LQ de incendio en cooldown');
    }
  }
}

/**
 * Envía mensaje de texto simple (a ambos bots si están habilitados)
 */
export async function sendMessage(message: string): Promise<void> {
  // Enviar a bot de alta calidad
  if (botHQ && configHQ && configHQ.enabled) {
    try {
      await botHQ.sendMessage(configHQ.chatId, message, { parse_mode: 'Markdown' });
      console.log('📱 Mensaje enviado a Telegram HQ');
    } catch (error) {
      console.error('❌ Error al enviar mensaje HQ:', error);
    }
  }

  // Enviar a bot de baja calidad
  if (botLQ && configLQ && configLQ.enabled) {
    try {
      await botLQ.sendMessage(configLQ.chatId, message, { parse_mode: 'Markdown' });
      console.log('📱 Mensaje enviado a Telegram LQ');
    } catch (error) {
      console.error('❌ Error al enviar mensaje LQ:', error);
    }
  }
}

/**
 * Envía mensaje de inicio del sistema
 */
export async function sendStartupMessage(): Promise<void> {
  const message = `🚀 *Sistema de Detección Térmica Iniciado*\n\n` +
                 `🕒 ${new Date().toLocaleString('es-ES')}\n` +
                 `📹 Sistema activo y monitoreando`;
  
  await sendMessage(message);
}

/**
 * Envía mensaje de apagado del sistema
 */
export async function sendShutdownMessage(): Promise<void> {
  const message = `🛑 *Sistema de Detección Detenido*\n\n` +
                 `🕒 ${new Date().toLocaleString('es-ES')}`;
  
  await sendMessage(message);
}
