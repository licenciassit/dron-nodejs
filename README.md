# 🔥 Sistema de Detección Térmica para Drones

Sistema inteligente de vigilancia con cámara térmica USB para Raspberry Pi, diseñado para detectar personas e incendios en tiempo real mediante procesamiento de imágenes con OpenCV.

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura del Código](#-arquitectura-del-código)
- [Protocolos Utilizados](#-protocolos-utilizados)
- [Requisitos del Sistema](#-requisitos-del-sistema)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Uso](#-uso)
- [Estructura del Proyecto](#-estructura-del-proyecto)

## ✨ Características

- **Detección automática de personas** mediante análisis térmico con umbral dinámico
- **Detección de incendios** basada en temperatura absoluta
- **Alertas en tiempo real vía Telegram** con fotogramas de detección
- **Grabación continua** de video con codec MJPEG optimizado
- **Procesamiento en tiempo real** adaptado para Raspberry Pi (160x120 @ 10fps)
- **Gestión automática de almacenamiento** (elimina videos antiguos después de 3 días)
- **Arquitectura modular** con separación de responsabilidades
- **Sistema de cooldown** para evitar spam de alertas

## 🏗️ Arquitectura del Código

El proyecto sigue una arquitectura modular con separación clara de responsabilidades:

### **`src/controlador.ts`** (Controlador Principal)
Módulo ejecutor que contiene toda la lógica de ejecución:
- **Punto de entrada principal** del sistema
- Configuración centralizada (CONFIG, TELEGRAM_CONFIG, VIDEO_DIRS)
- Loop principal de procesamiento de frames
- Inicialización y gestión de cámaras USB
- Manejo de señales del sistema (SIGINT, SIGTERM)
- Gestión del ciclo de vida completo del sistema
- Funciones utilitarias (percentile, timestamps, paths)
- Control de VideoWriter para grabación

### **`src/camara-termica.ts`** (Módulo de Endpoints/Exportadores)
Módulo de funciones exportadas para detección térmica:
- `detectFire()` - Endpoint para detección de incendios
- `detectPerson()` - Endpoint para detección de personas
- `processFrame()` - Endpoint para procesamiento completo de frames
- Algoritmos de procesamiento morfológico
- Lógica de análisis de contornos y máscaras
- Sin lógica de ejecución (solo funciones exportadas)

### **`src/telegram.ts`** (Módulo de Notificaciones)
Maneja la integración con Telegram:
- Inicialización del bot
- Envío de alertas con fotogramas
- Sistema de cooldown anti-spam
- Mensajes de inicio/apagado del sistema

### **`utils/models/opencv4nodejs.d.ts`**
Definiciones de tipos TypeScript para OpenCV

## 🔌 Protocolos Utilizados

### **1. USB (Universal Serial Bus)**
- Comunicación con la cámara térmica
- Dispositivos accesibles como `/dev/video0`, `/dev/video1`, etc.
- Compatible con UVC (USB Video Class)

### **2. V4L2 (Video4Linux2)**
- Protocolo principal de captura de video en Linux
- Acceso a dispositivos de video mediante drivers del kernel
- Control de propiedades: resolución, FPS, formato
- Utilizado a través de la API de OpenCV

### **3. MJPEG (Motion JPEG)**
- Codec de video para almacenamiento
- Cada frame se comprime como JPEG independiente
- Bajo costo computacional (ideal para Raspberry Pi)
- Formato de salida: archivos `.avi`

### **4. File System Protocol**
- Protocolo POSIX para operaciones de I/O
- Gestión de archivos de video
- Limpieza automática basada en timestamp

### **5. Telegram Bot API (HTTPS/TLS)**
- Comunicación segura con servidores de Telegram
- Envío de mensajes y fotos mediante API REST
- Autenticación mediante token de bot
- Protocolo: HTTPS sobre TLS 1.2+

### **Flujo de Datos**
```
Cámara Térmica USB → V4L2 Driver → OpenCV VideoCapture → 
Procesamiento (Detección) → MJPEG Encoder → Archivo AVI
                          ↓
                   (Si detecta amenaza)
                          ↓
                  Fotograma JPEG → Telegram Bot API → Usuario
```

## 💻 Requisitos del Sistema

### Hardware
- Raspberry Pi 3/4/5 (recomendado 2GB+ RAM)
- Cámara térmica USB compatible con UVC
- Tarjeta microSD (16GB+ recomendado)

### Software
- Raspberry Pi OS (Bullseye o superior)
- Node.js 20.x LTS
- OpenCV 4.x
- TypeScript 5.x

## 🚀 Instalación

### En Raspberry Pi (vía SSH o directamente)

#### 1. Preparar el sistema
```bash
sudo apt-get update
sudo apt-get install -y build-essential cmake pkg-config
sudo apt-get install -y libopencv-dev python3-opencv
```

#### 2. Instalar Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 3. Clonar el proyecto
```bash
cd ~/
git clone https://github.com/licenciassit/dron-nodejs.git
cd dron-nodejs
```

#### 4. Instalar dependencias
```bash
# Deshabilitar autobuild de OpenCV (usamos el del sistema)
export OPENCV4NODEJS_DISABLE_AUTOBUILD=1
npm install
```
⚠️ **Nota**: La instalación puede tardar 1-2 horas en Raspberry Pi

#### 5. Compilar TypeScript
```bash
npm run build
```

## ⚙️ Configuración

### Parámetros de Detección
Edita `src/controlador.ts` para ajustar la configuración:

```typescript
export const CONFIG = {
  FRAME_WIDTH: 160,           // Ancho de frame (px)
  FRAME_HEIGHT: 120,          // Alto de frame (px)
  MIN_AREA: 50,               // Área mínima de detección (px²)
  MAX_AREA: 30000,            // Área máxima de detección (px²)
  PERSON_PERCENTILE: 30,      // Umbral percentil para personas
  FIRE_THRESHOLD_ABS: 255,    // Umbral absoluto para fuego
  FPS: 10,                    // Frames por segundo
  RETENTION_DAYS: 3,          // Días de retención de videos
  PROCESS_EVERY_N_FRAMES: 2,  // Procesar cada N frames
};
```

### Configuración de Telegram Bot (Dual: Alta y Baja Calidad)

El sistema soporta dos canales de Telegram simultáneos para enviar alertas:
- **Alta Calidad (HQ)**: Imágenes en resolución original
- **Baja Calidad (LQ)**: Imágenes reducidas al 50% (menos datos móviles)

#### Paso 1: Crear Bot(s) de Telegram
1. Abre Telegram y busca **@BotFather**
2. Envía el comando `/newbot`
3. Sigue las instrucciones y elige un nombre para tu bot
4. **Guarda el token** que te proporciona (ejemplo: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. *Opcional*: Repite el proceso para crear un segundo bot (uno para HQ, otro para LQ)
   - Puedes usar el mismo bot para ambos canales si prefieres

#### Paso 2: Obtener Chat ID(s)
1. Busca **@userinfobot** en Telegram
2. Inicia conversación y te mostrará tu **Chat ID** (ejemplo: `987654321`)
3. Para grupos: Añade el bot al grupo y usa @userinfobot dentro del grupo
4. Puedes usar diferentes chats/grupos para HQ y LQ

#### Paso 3: Configurar el Sistema
Edita `src/controlador.ts` y actualiza la configuración de Telegram:

```typescript
export const TELEGRAM_CONFIG = {
  highQuality: {
    enabled: true,                              // Habilitar canal HQ
    botToken: '123456789:ABCdefGHI...',        // Token del bot HQ
    chatId: '987654321',                        // Chat ID para HQ
    cooldownSeconds: 30,                        // Cooldown HQ
  },
  lowQuality: {
    enabled: true,                              // Habilitar canal LQ
    botToken: '987654321:XYZabcDEF...',        // Token del bot LQ (puede ser el mismo)
    chatId: '123456789',                        // Chat ID para LQ (puede ser diferente)
    cooldownSeconds: 30,                        // Cooldown LQ
  },
};
```

**Configuraciones posibles:**
- **Opción 1**: Mismo bot, diferentes chats (un chat personal HQ, un grupo LQ)
- **Opción 2**: Dos bots diferentes (útil para separar completamente las alertas)
- **Opción 3**: Solo uno habilitado (HQ o LQ), el otro deshabilitado

**Importante**: 
- Las alertas tienen un cooldown configurable para evitar spam
- Se enviará una foto del fotograma donde se detectó la amenaza
- Las alertas de incendio tienen prioridad CRÍTICA

### Directorios de Almacenamiento
```typescript
export const VIDEO_DIRS = {
  THERMAL: 'videos',      // Videos térmicos procesados
  RGB: 'videos_rgb',      // Videos RGB (si disponible)
};
```

## 🎯 Uso

### Iniciar el sistema de detección térmica
```bash
npm start
```

### Pruebas con Webcam (sin cámara térmica)
Para desarrollo y pruebas con webcam normal:
```bash
npm run test:webcam
```
Este modo detecta objetos rojos como simulación de fuego.

### Modo desarrollo (recompila automáticamente)
```bash
npm run dev
```

### Detener el sistema
Presiona `Ctrl+C` para detener la grabación y liberar recursos

### Salida esperada
```
🔥 Iniciando sistema de detección térmica...
✅ Bot de Telegram inicializado
📱 Mensaje enviado a Telegram
📹 Buscando cámaras...
✅ Cámara en /dev/video0
✅ Cámara térmica OK
🎥 Grabando en: videos/thermal_20251117_143022.avi
📊 Presiona Ctrl+C para detener
👤 Persona! Área: 850px
� Alerta de persona enviada a Telegram
�🔥 INCENDIO! Área: 1200px
� Alerta de incendio enviada a Telegram
�📹 Frames procesados: 100
```

### Ejemplo de Alertas de Telegram

Cuando se detecta una **persona** (Alta Calidad):
```
⚠️ ADVERTENCIA: PERSONA DETECTADA

🕒 Hora: 17/11/2025, 14:30:22
📏 Área: 850 px²
📸 Alta Calidad
```
*(Incluye foto en resolución original)*

Cuando se detecta una **persona** (Baja Calidad):
```
⚠️ ADVERTENCIA: PERSONA DETECTADA

🕒 Hora: 17/11/2025, 14:30:22
📏 Área: 850 px²
📸 Baja Calidad
```
*(Incluye foto reducida al 50%)*

Cuando se detecta un **incendio**:
```
🔥 ADVERTENCIA CRÍTICA: INCENDIO DETECTADO

🕒 Hora: 17/11/2025, 14:35:10
📏 Área: 1200 px²

⚡ ¡ALERTA MÁXIMA!
📸 Alta Calidad / Baja Calidad
```
*(Incluye foto del fotograma en ambos canales)*

## 📁 Estructura del Proyecto

```
dron-nodejs/
├── src/
│   ├── controlador.ts         # Controlador principal (ejecuta todo el sistema)
│   ├── camara-termica.ts      # Exportadores/Endpoints (funciones de detección)
│   ├── prueba-webcam.ts       # Módulo de pruebas con webcam
│   └── telegram.ts            # Integración con Telegram Bot (dual)
├── utils/
│   └── models/
│       └── opencv4nodejs.d.ts # Definiciones de tipos
├── temp/                      # Fotogramas temporales para Telegram
├── videos/                    # Videos térmicos procesados
├── videos_rgb/                # Videos RGB / pruebas webcam
├── dist/                      # Código compilado
├── package.json
├── tsconfig.json
└── README.md
```

## 🔬 Algoritmo de Detección

### Detección de Personas
1. Conversión a escala de grises
2. Aplicación de mapa de calor (COLORMAP_JET)
3. Extracción del canal rojo
4. Cálculo de umbral dinámico (percentil 30)
5. Binarización y procesamiento morfológico
6. Detección de contornos con filtro de aspect ratio (>0.7)

### Detección de Incendios
1. Mismo preprocesamiento que personas
2. Umbral absoluto en canal rojo (255)
3. Procesamiento morfológico (apertura + dilatación)
4. Detección de contornos con filtro de área mínima

## � Optimizaciones para Raspberry Pi

- Resolución reducida (160x120) para menor carga CPU
- FPS limitado a 10 para estabilidad
- Procesamiento cada 2 frames (50% reducción)
- Codec MJPEG (sin inter-frame compression)
- Kernel morfológico pequeño (3x3)

## 🛠️ Scripts Disponibles

```bash
npm run build        # Compilar TypeScript
npm start            # Ejecutar detector térmico
npm run dev          # Compilar y ejecutar detector
npm run test:webcam  # Ejecutar pruebas con webcam
npm run watch        # Compilar en modo watch
```

## 🔄 Diferencias entre Detector Térmico y Prueba Webcam

| Característica | camara-termica.ts | prueba-webcam.ts |
|---|---|---|
| **Cámara** | Cámara térmica USB | Webcam normal RGB |
| **Resolución** | 160x120 @ 10fps | 640x480 @ 30fps |
| **Detección** | Análisis térmico de personas/fuego | Detección de objetos rojos |
| **Propósito** | Producción | Desarrollo/pruebas |
| **Alertas Telegram** | ✅ Completas | ✅ Simulación |
| **Uso** | `npm start` | `npm run test:webcam` |

## 📝 Notas Técnicas

- Los archivos `.avi` se guardan con timestamp en el nombre
- La limpieza automática se ejecuta al inicio
- El sistema libera recursos automáticamente al detener (Ctrl+C)
- Compatible con múltiples cámaras USB (detecta automáticamente)

## 📄 Licencia

MIT

## 👤 Autor

Felipe - [licenciassit](https://github.com/licenciassit)

