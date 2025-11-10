# En la Raspberry Pi (vía SSH o directamente)
sudo apt-get update
sudo apt-get install -y build-essential cmake pkg-config
sudo apt-get install -y libopencv-dev python3-opencv

# Instalar Node.js (versión ARM)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clonar/transferir tu proyecto
cd ~/
git clone [tu-repo] # o usa scp para transferir

# Instalar dependencias (TARDA MUCHO - puede tardar 1-2 horas)
cd dron-nodejs
export OPENCV4NODEJS_DISABLE_AUTOBUILD=1
npm install

# Sistema de Detección Térmica

Sistema de vigilancia con cámara térmica para detectar personas e incendios en tiempo real.

## Instalación
```bash
npm install
```

## Uso

### 1. Calibrar HSV (Opcional)
```bash
npm run calibrate
```

### 2. Ejecutar detector
```bash
npm start
```

## ⌨️ Controles

- **ESC**: Salir
- **c**: Capturar snapshot

## 📁 Carpetas

- `videos/` - Videos térmicos procesados
- `videos_rgb/` - Videos RGB sin procesar

