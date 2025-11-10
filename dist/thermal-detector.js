"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const opencv4nodejs_1 = __importDefault(require("@u4/opencv4nodejs"));
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
// CONFIGURACIÓN OPTIMIZADA PARA RASPBERRY PI
const FRAME_WIDTH = 160;
const FRAME_HEIGHT = 120;
const MIN_AREA = 50;
const MAX_AREA = 30000;
const PERSON_PERCENTILE = 30;
const FIRE_THRESHOLD_ABS = 255;
const FPS = 10;
const RETENTION_DAYS = 3;
const PROCESS_EVERY_N_FRAMES = 2;
const VIDEO_DIR_THERMAL = 'videos';
const VIDEO_DIR_RGB = 'videos_rgb';
fs.ensureDirSync(VIDEO_DIR_THERMAL);
fs.ensureDirSync(VIDEO_DIR_RGB);
function deleteOldFiles(folder) {
    if (!fs.existsSync(folder))
        return;
    const now = Date.now();
    const files = fs.readdirSync(folder);
    files.forEach((file) => {
        const filePath = path.join(folder, file);
        try {
            const stats = fs.statSync(filePath);
            if (!stats.isFile())
                return;
            const fileAge = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
            if (fileAge > RETENTION_DAYS) {
                console.log(`🗑 Borrando: ${filePath}`);
                fs.unlinkSync(filePath);
            }
        }
        catch (e) {
            // Ignorar errores
        }
    });
}
function findUsbCamera(maxIndex = 5) {
    for (let i = 0; i < maxIndex; i++) {
        try {
            const cap = new opencv4nodejs_1.default.VideoCapture(i);
            const frame = cap.read();
            if (!frame.empty) {
                cap.release();
                console.log(`✅ Cámara en /dev/video${i}`);
                return i;
            }
            cap.release();
        }
        catch (e) {
            continue;
        }
    }
    console.log('⚠️ No se detectó cámara, usando índice 0');
    return 0;
}
function percentile(array, p) {
    const sorted = array.slice().sort((a, b) => a - b);
    const index = Math.floor((p / 100) * sorted.length);
    return sorted[index];
}
async function main() {
    console.log('🔥 Iniciando sistema de detección térmica...');
    deleteOldFiles(VIDEO_DIR_THERMAL);
    deleteOldFiles(VIDEO_DIR_RGB);
    console.log('📹 Buscando cámaras...');
    const thermalIndex = findUsbCamera();
    const capThermal = new opencv4nodejs_1.default.VideoCapture(thermalIndex);
    capThermal.set(opencv4nodejs_1.default.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH);
    capThermal.set(opencv4nodejs_1.default.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT);
    capThermal.set(opencv4nodejs_1.default.CAP_PROP_FPS, FPS);
    const testFrame = capThermal.read();
    if (testFrame.empty) {
        console.log('❌ No se pudo abrir la cámara térmica.');
        capThermal.release();
        return;
    }
    console.log('✅ Cámara térmica OK');
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15).replace('T', '_');
    const thermalPath = path.join(VIDEO_DIR_THERMAL, `thermal_${timestamp}.avi`);
    const fourcc = opencv4nodejs_1.default.VideoWriter.fourcc('MJPG');
    const outThermal = new opencv4nodejs_1.default.VideoWriter(thermalPath, fourcc, FPS, new opencv4nodejs_1.default.Size(FRAME_WIDTH, FRAME_HEIGHT));
    console.log(`🎥 Grabando en: ${thermalPath}`);
    console.log('📊 Presiona Ctrl+C para detener');
    const kernel = opencv4nodejs_1.default.getStructuringElement(opencv4nodejs_1.default.MORPH_ELLIPSE, new opencv4nodejs_1.default.Size(3, 3));
    let frameCount = 0;
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
            const gray = frameThermal.cvtColor(opencv4nodejs_1.default.COLOR_BGR2GRAY);
            const heatmap = gray.applyColorMap(opencv4nodejs_1.default.COLORMAP_JET);
            const channels = heatmap.splitChannels();
            const red = channels[2];
            const redData = red.getDataAsArray().flat();
            const personThresh = percentile(redData, PERSON_PERCENTILE);
            const maskPerson = red.threshold(personThresh, 255, opencv4nodejs_1.default.THRESH_BINARY);
            const maskFire = red.threshold(FIRE_THRESHOLD_ABS, 255, opencv4nodejs_1.default.THRESH_BINARY);
            const maskPersonProcessed = maskPerson
                .morphologyEx(kernel, opencv4nodejs_1.default.MORPH_OPEN, new opencv4nodejs_1.default.Point2(-1, -1), 1)
                .morphologyEx(kernel, opencv4nodejs_1.default.MORPH_DILATE, new opencv4nodejs_1.default.Point2(-1, -1), 1);
            const maskFireProcessed = maskFire
                .morphologyEx(kernel, opencv4nodejs_1.default.MORPH_OPEN, new opencv4nodejs_1.default.Point2(-1, -1), 1)
                .morphologyEx(kernel, opencv4nodejs_1.default.MORPH_DILATE, new opencv4nodejs_1.default.Point2(-1, -1), 1);
            const out = heatmap.copy();
            // Detectar incendios
            const contoursFire = maskFireProcessed.findContours(opencv4nodejs_1.default.RETR_EXTERNAL, opencv4nodejs_1.default.CHAIN_APPROX_SIMPLE);
            contoursFire.forEach((contour) => {
                const area = contour.area;
                if (area < MIN_AREA)
                    return;
                const rect = contour.boundingRect();
                out.drawRectangle(new opencv4nodejs_1.default.Point2(rect.x, rect.y), new opencv4nodejs_1.default.Point2(rect.x + rect.width, rect.y + rect.height), new opencv4nodejs_1.default.Vec3(0, 0, 255), 2);
                out.putText('Incendio', new opencv4nodejs_1.default.Point2(rect.x, rect.y - 6), opencv4nodejs_1.default.FONT_HERSHEY_SIMPLEX, 0.4, new opencv4nodejs_1.default.Vec3(0, 0, 255), 1);
                console.log(`🔥 INCENDIO! Área: ${area.toFixed(0)}px`);
            });
            // Detectar personas
            const contoursPerson = maskPersonProcessed.findContours(opencv4nodejs_1.default.RETR_EXTERNAL, opencv4nodejs_1.default.CHAIN_APPROX_SIMPLE);
            contoursPerson.forEach((contour) => {
                const area = contour.area;
                if (area < MIN_AREA || area > MAX_AREA)
                    return;
                const rect = contour.boundingRect();
                const aspect = rect.height / (rect.width + 1e-6);
                if (aspect < 0.7)
                    return;
                out.drawRectangle(new opencv4nodejs_1.default.Point2(rect.x, rect.y), new opencv4nodejs_1.default.Point2(rect.x + rect.width, rect.y + rect.height), new opencv4nodejs_1.default.Vec3(0, 255, 0), 2);
                out.putText('Persona', new opencv4nodejs_1.default.Point2(rect.x, rect.y - 6), opencv4nodejs_1.default.FONT_HERSHEY_SIMPLEX, 0.4, new opencv4nodejs_1.default.Vec3(0, 255, 0), 1);
                console.log(`👤 Persona! Área: ${area.toFixed(0)}px`);
            });
            outThermal.write(out);
            if (frameCount % 100 === 0) {
                console.log(`📹 Frames procesados: ${frameCount}`);
            }
        }
        catch (error) {
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
