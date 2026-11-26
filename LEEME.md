# Denis Center 1.0

App web instalable (PWA) para registrar clientes, equipos, turnos, trabajos,
cobros y garantías (90 días). Funciona en celular y en la compu.

## Etapa 1 (esta entrega)
- Base de datos completa en Supabase: clientes, equipos, trabajos, repuestos, pagos, fotos y usuarios
- Cálculo automático de total, saldo pendiente, estado de cobro y garantía
- Seguridad: solo usuarios activos ven los datos (el primer usuario queda como admin)
- Pantallas: Ingresar · Inicio (turnos y "Me deben") · Clientes (buscador, alta, edición, ficha con WhatsApp)

## Etapa 2
- Equipos por cliente (alta, edición, ficha con garantía vigente e historial)
- Trabajos: agendar turno, completar, registrar trabajo ya hecho, cancelar
- Repuestos y pagos parciales con saldo pendiente
- WhatsApp: confirmar turno y enviar comprobante del trabajo

## Etapa 3
- Fotos desde la cámara o la galería, en el trabajo y en el equipo
- Etiquetas: equipo, placa/modelo, pieza cambiada, antes, después
- Se comprimen en el celular (~1600 px, JPEG) antes de subir
- Visor a pantalla completa (deslizar para pasar, quitar)

## Etapa 4 — Ajustes
> Requiere ejecutar `sql/02_configuracion.sql` en Supabase (SQL Editor).
- Mi perfil: cambiar el nombre propio
- Datos del negocio para mensajes y comprobantes
- Usuarios: activar/desactivar ayudantes, cambiar rol (siempre queda un admin)
- Copia de seguridad en Excel

## Etapa 5 — Herramientas
> Requiere ejecutar `sql/03_herramientas.sql` en Supabase (SQL Editor).
- Agenda por día y por semana
- Lista de precios (repuestos y servicios) con autocompletado
- Repuestos y cobro en el mismo formulario al crear o completar un trabajo
- Resumen de ganancias por mes
- Recordatorios de mantenimiento
- Modo sin señal

## Alias para transferencias
> Requiere ejecutar `sql/04_alias.sql` en Supabase.
- Alias, CBU/CVU, titular y banco en Ajustes
- Botones "Pasar alias" (WhatsApp con monto) y "Copiar alias"

---

## Puesta en marcha

### 1. Crear el proyecto en Supabase
1. Entrá a https://supabase.com y creá una cuenta (podés usar GitHub o tu correo).
2. **New project** → nombre `denis-center`, elegí una contraseña de base de datos
   (guardala) y la región más cercana (São Paulo).
3. Esperá un par de minutos a que termine de crearse.

### 2. Crear las tablas
1. Menú izquierdo → **SQL Editor** → **New query**.
2. Pegá TODO el contenido de `sql/01_esquema.sql` y apretá **Run**.
3. Tiene que decir "Success. No rows returned".

### 3. Crear tu usuario (después del paso 2)
1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Tu correo y una contraseña. Marcá **Auto Confirm User**.
3. Al ser el primero, queda automáticamente como **admin activo**.
4. Recomendado: en **Authentication → Sign In / Providers**, desactivá
   **Allow new users to sign up**, así nadie más puede registrarse por su cuenta.

### 4. Conectar la app
1. **Project Settings** → **API** (o **API Keys**).
2. Copiá la **Project URL** y la clave **anon / publishable** (NUNCA la `service_role` / `secret`).
3. Pegalas en `js/config.js`.

### 5. Probar en la compu
En la carpeta del proyecto:
```
python -m http.server 8000
```
y abrí http://localhost:8000

### 6. Publicar gratis (para usarla en el celular)
Con GitHub Pages: subí la carpeta a un repositorio → **Settings → Pages** →
rama `main`, carpeta `/ (root)`. Queda en `https://TU-USUARIO.github.io/denis-center/`.
Desde el celular, abrí ese link en Chrome → menú ⋮ → **Agregar a pantalla principal**.

> La clave pública puede ir en el código: los datos están protegidos por las
> reglas de seguridad (RLS) de la base, que exigen usuario y contraseña.

## Estructura
```
index.html          Página principal
manifest.json       Datos para instalar la app
sw.js               Guarda la app en el celular (subir VERSION al cambiar archivos)
css/estilos.css
js/config.js        ← tus datos de Supabase
js/app.js           Arranque, sesión y navegación
js/supabase.js      Conexión
js/util.js          Formatos, WhatsApp, utilidades
js/vistas/          Una pantalla por archivo
sql/01_esquema.sql  Base de datos
iconos/
```

## Versión 1.1 — Apariencia
- Tres estilos: Clara, Azul profundo y Oscura (Ajustes → Apariencia o botón de paleta arriba)
- Se guarda por celular
- Íconos de línea en lugar de emojis, letra del logo, botón "+" flotante

## Versión 1.2 — Presupuestos y botones rápidos
> Requiere ejecutar `sql/05_presupuestos.sql` en Supabase.
- Presupuestos con N° correlativo, ítems, mano de obra y validez; envío por WhatsApp
- "Aceptó" crea el trabajo (con sus repuestos) listo para ponerle fecha
- Botones "Voy en camino" (WhatsApp con tiempo estimado) y "Cómo llegar" (Google Maps)
- Agenda por mes

## Versión 1.3 — Dictado por voz
- Botón de micrófono en los campos de texto y números (nombres, direcciones, notas, repuestos, precios, buscadores)
- Números dictados: "18 mil" → 18000; teléfonos dictados de a dígitos
- Se puede ocultar en Ajustes → Dictado por voz. Necesita señal.

## Versión 1.4 — Eliminar, papelera y boleta
> Requiere ejecutar `sql/06_eliminar.sql` en Supabase.
- Eliminar clientes, equipos, trabajos/turnos y presupuestos; Papelera para recuperarlos (Ajustes → Herramientas)
- Boleta / comprobante de pago en imagen con logo: concepto editable y total (mano de obra y repuestos incluidos), sin detalle; compartir por WhatsApp o descargar
- El mensaje de WhatsApp del trabajo ya no muestra el detalle de repuestos

## Versión 1.5 — Clientes desde el celular
- Nuevo cliente: "Mis contactos" (agenda del celular) y "Pegar número" (limpia +54 9, espacios y guiones)
- Denis Center aparece en "Compartir" de Android: compartir un contacto desde WhatsApp abre Nuevo cliente completado
- Aviso si el teléfono ya pertenece a otro cliente

## Versión 1.6 — Ubicación del cliente
> Requiere ejecutar `sql/07_ubicacion.sql` en Supabase.
- Campo "Ubicación en el mapa": pegar el link de Google Maps de WhatsApp o guardar el GPS actual ("Estoy acá")
- "Cómo llegar" usa la ubicación guardada; en la ficha, "Ver en el mapa"
- Compartir una ubicación de Maps hacia Denis Center la carga en Nuevo cliente

## Versión 2.0 — DC multi-negocio
- La app pasa a llamarse **DC** (ícono nuevo con la D, la C y el copo de nieve).
- Cada técnico tiene su **negocio**: sus clientes, trabajos, fotos y presupuestos son solo suyos.
- El primer administrador es el **superadministrador**: en Ajustes → Administración crea cuentas
  para otros técnicos (contraseña provisoria), las suspende/reactiva y les da contraseña nueva.
  Solo ve cantidades (clientes, trabajos, fotos), no los datos de cada técnico.
- Cada técnico carga su **logo** y los datos de su negocio en Ajustes; salen en el encabezado y en el comprobante.
- La primera vez que un técnico entra, la app le pide elegir su propia contraseña.

### Instalación
1. Descargar la copia de seguridad en Excel (Ajustes → Copia de seguridad).
2. Ejecutar `sql/08_multinegocio.sql` en Supabase → SQL Editor.
3. Supabase → Edge Functions → Deploy a new function → Via Editor, nombre `admin-usuarios`,
   pegar `supabase/functions/admin-usuarios/index.ts`, desactivar **Verify JWT** (la función
   verifica sola que sea el superadministrador) y Deploy.

## Versión 2.1 — Términos y Condiciones
- La primera vez que entra, cada técnico tiene que leer y aceptar los Términos y Condiciones y la
  Política de Privacidad (texto en `js/terminos.js`). Queda constancia de quién, qué versión, cuándo y
  desde qué dispositivo (tabla `aceptaciones_terminos`).
- Si se cambia el texto, subir `VERSION_TERMINOS` y a todos se les vuelve a pedir.
- Instalación: ejecutar `sql/09_terminos.sql` en Supabase → SQL Editor.

## Versión 2.2 — Invitaciones
- En Administración → **Invitar técnico** se genera un link único (dura 7 días, se usa una vez) para mandar por WhatsApp.
- El técnico completa apellido, nombre, localidad, negocio, correo y celular, y acepta los términos, sin tener cuenta.
- La solicitud aparece en **Solicitudes para aprobar**: al aprobar se crea la cuenta y se muestra la contraseña provisoria.
- Instalación: ejecutar `sql/10_datos_tecnico.sql` y `sql/11_invitaciones.sql` en Supabase → SQL Editor.

## Versión 2.3 — Avisos al celular
- Cuando un técnico completa el formulario de invitación, le suena el celular al superadministrador.
- En la app: globito rojo en Ajustes y cartel en Inicio con las solicitudes pendientes.
- Instalación: ejecutar `sql/12_avisos.sql` y crear la función `avisos` (pegar `supabase/functions/avisos/index.ts`,
  desactivar "Verify JWT"). Después, en Administración → **Activar avisos** en el celular donde se quiere recibir.
