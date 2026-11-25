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

## Próximas etapas
3. Fotos con la cámara (comprimidas)
4. Modo sin conexión con sincronización
5. Gestión de ayudantes

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
