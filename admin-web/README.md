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
24.15+ o 26+. Al actualizar los fuentes del panel, el script detecta cambios
y vuelve a compilar. También puedes reconstruir manualmente con
`cd admin-web && npm ci && npm run build`.
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
| Crear cuenta | `create nombre sexo correo contraseña` | Nombre y clave de 4–23 caracteres |
| Cambiar clave | `password nombre contraseña` | Sustituye la clave de una cuenta existente |
| Borrar cuenta | `delete nombre` | Pide repetir el nombre y confirmar la acción |
| Asignar GM | `gm usuario nivel` | Nivel entre 0 y 99; 0 lo quita |
| Bloquear / desbloquear | `block` / `unblock` | Confirma antes de ejecutar |
| Aviso global | `kami mensaje` | ASCII imprimible, 1–160 caracteres |

El servidor web permite solo estas órdenes y no implementa una consola de
comandos libre. Para otras tareas usa `./scripts/admin.sh`. TMWA responde en
inglés y los nombres de cuentas del panel admiten letras ASCII, números,
punto, guion y guion bajo, hasta 23
caracteres. Algunos cambios de nivel GM se reflejan tras volver a entrar al
juego.

La clave de **jugador** introducida al crear o modificar una cuenta viaja
desde la página al servicio local en `127.0.0.1` y de ahí a `tmwa-admin` por
stdin. La página limpia los campos al terminar; el servicio nunca devuelve
la salida cruda de estas tres acciones porque podría contener datos
sensibles. Los nombres al crear requieren al menos cuatro caracteres; las
claves admiten 4–23 caracteres ASCII visibles sin espacios ni comillas. El
correo admite hasta 39 caracteres. Si una operación tarda demasiado,
comprueba el estado de la cuenta antes de repetirla.

## Seguridad y límites

- El proceso solo escucha en `127.0.0.1` y verifica la cabecera `Host`.
- Las escrituras exigen `Origin` local y JSON; no activa CORS ni utiliza
  cookies. Las órdenes se validan y se envían por stdin a `tmwa-admin`, sin
  ejecutar una shell ni exponer la contraseña de administración.
- No uses túneles, redirecciones de puertos ni proxies para publicar el panel.
  Quien tiene acceso al proceso local puede administrar las cuentas.
- Solo acepta una operación cada vez; cada operación termina en 15 segundos
  y limita la salida a 256 KiB.
- El borrado también necesita confirmar con `y` dentro de `tmwa-admin`; el
  servicio envía esa respuesta solo después de recibir su pregunta.
- Si falta la compilación de Angular, inicia el script en lugar de ejecutar
  `node backend/server.mjs` directamente.
