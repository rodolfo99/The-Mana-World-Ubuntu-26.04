# Panel local de administración

Interfaz Angular 22 para el servidor TMWA del proyecto. Incluye un servicio
Node.js sin dependencias externas de backend: sirve la aplicación en
`127.0.0.1:3010` y ejecuta una orden validada por llamada a `tmwa-admin`.
La contraseña de administración permanece en los ficheros locales de TMWA.
El navegador nunca recibe ese archivo ni ejecuta comandos arbitrarios.

## Iniciar

Desde la raíz del repositorio, tras `./scripts/preparar-fuentes.sh` y
`./scripts/instalar.sh`:

1. En una terminal inicia `./scripts/servidor.sh`.
2. En otra ejecuta `./scripts/admin-web.sh` con tu usuario normal.
3. Abre `http://127.0.0.1:3010` en **ese mismo equipo**.

El script instala los paquetes con `npm ci` y ejecuta `npm run build` en el
primer arranque (solo para la interfaz). Necesitas npm y Node.js 22.22.3+,
24.15+ o 26+. Las compilaciones siguientes usan los archivos ya generados;
si editas Angular, reconstruye con `cd admin-web && npm ci && npm run build`.
Detén el servicio con `Ctrl+C`. Para usar otro puerto:

```bash
ADMIN_WEB_PORT=3011 ./scripts/admin-web.sh
```

No es necesario Docker. Si el servidor corre con Compose, confirma que
`tmwa-admin` y su configuración local apunten a ese servidor antes de usar
el panel; la ruta recomendada es la instalación nativa de esta guía.

## Funciones

| Vista | Orden de TMWA | Datos |
| --- | --- | --- |
| Cuentas | `list inicio fin` | Hasta 200 identificadores por consulta |
| GM | `listgm` | Cuentas con nivel GM |
| En línea | `getcount` | Número conectado al login |
| Buscar nombre | `id usuario` | Identificador de cuenta |
| Consultar ID | `info identificador` | Detalles de esa cuenta |
| Asignar GM | `gm usuario nivel` | Nivel entre 0 y 99; 0 lo quita |
| Bloquear / desbloquear | `block` / `unblock` | Confirma antes de ejecutar |
| Aviso global | `kami mensaje` | ASCII imprimible, 1–160 caracteres |

El servidor web permite solo estas órdenes; no implementa cuentas nuevas,
contraseñas, borrado ni una consola de comandos. Para otras tareas usa
`./scripts/admin.sh`. TMWA responde en inglés y los nombres de cuentas del
panel admiten letras ASCII, números, punto, guion y guion bajo, hasta 23
caracteres. Algunos cambios de nivel GM se reflejan tras volver a entrar al
juego.

## Seguridad y límites

- El proceso solo escucha en `127.0.0.1` y verifica la cabecera `Host`.
- Las escrituras exigen `Origin` local y JSON; no activa CORS ni utiliza
  cookies. Las órdenes se validan y se envían por stdin a `tmwa-admin`, sin
  ejecutar una shell ni exponer la contraseña.
- No uses túneles, redirecciones de puertos ni proxies para publicar el panel.
  Quien tiene acceso al proceso local puede administrar las cuentas.
- Solo acepta una operación cada vez; cada operación termina en 15 segundos
  y limita la salida a 256 KiB.
- Si falta la compilación de Angular, inicia el script en lugar de ejecutar
  `node backend/server.mjs` directamente.
