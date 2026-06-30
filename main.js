const { app, BrowserWindow } = require('electron')
const path = require('path')

// Cambia esta URL a tu URL de producción (ej: 'https://mi-app.vercel.app')
// Si dejas localhost, asegúrate de correr 'npm run dev' en otra consola antes de abrir el exe.
const APP_URL = 'http://localhost:3000'

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'public/favicon.ico'), // Opcional si tienes un ícono
    autoHideMenuBar: true, // Oculta el menú superior (Archivo, Editar...) para parecer app nativa
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Carga la URL de tu Next.js
  win.loadURL(APP_URL)
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
