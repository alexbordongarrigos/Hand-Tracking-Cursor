# Instrucciones de Despliegue (Vercel)

## 1. Despliegue en la Nube

He configurado el proyecto para ser desplegado en **Vercel**, lo que te permite tener un enlace gratuito y "limpio" (sin tu nombre de usuario).

1. Entra en [Vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"Add New"** > **"Project"**.
3. Importa el repositorio `Hand-Tracking-Cursor`.
4. En **Project Name**, elige un nombre (ej: `starseed-cursor-hand`).
5. Haz clic en **Deploy**.

¡Listo! Tu web estará viva en `el-nombre-que-elegiste.vercel.app`. Cada vez que hagas `git push`, la web se actualizará sola.

*Nota: Asegúrate de darle permisos a tu cámara cuando visites la página.*

## 2. Iniciar el Servidor de Control de Ratón (Mac local)

El Backend de Node.js + Python debe correr SIEMPRE en la Mac que quieres controlar, ya que es la encargada de recibir las órdenes (coordenadas del cursor, clics, etc.) desde la nube y ejecutarlas localmente.

```bash
# Entra a la carpeta del proyecto
cd /ruta/al/proyecto/hand-tracking-cursor

# Inicia el backend (y el script de Python)
npm run backend
```
El servidor te indicará: `Mouse Controller Backend listening on port 3001`

*Nota: Necesitas tener Python, Node.js y las dependencias (pynput, pyautogui) instaladas en esa máquina.*

## 3. Conexión Remota (Controlar tu Mac desde otro lado)

Si quieres acceder al frontend (la web en GitHub Pages) desde tú teléfono o laptop y controlar tu Mac a la distancia, sigue estos pasos:

1. **Abre el Frontend**: Entra a `https://alexbordongarrigos.github.io/Hand-Tracking-Cursor/` desde tu dispositivo (ej. tu teléfono).
2. **Abre los Ajustes**: Haz clic en el botón de ajustes (⚙️) en la parte superior.
3. **Cambia la URL del WebSocket**:
   - Para que funcionen en la misma red Wi-Fi, averigua la **IP local** de tu Mac (puedes verla en los Ajustes de Wi-Fi de Mac, usualmente empieza con `192.168.x.x`).
   - Ingresa: `ws://192.168.1.XX:3001` (reemplaza `192.168.1.XX` por tu IP).
   - ¡Cierra los ajustes y tu web se conectará directo a tu Mac!

*Tip avanzado: Si quieres controlarlo usando datos móviles (fuera de casa), necesitarás usar una herramienta como `ngrok` en tu Mac para exponer el puerto 3001 de manera segura a internet (ej. `ngrok http 3001`) y usar la URL dada (ej. `wss://tu-url.ngrok.io`).*
