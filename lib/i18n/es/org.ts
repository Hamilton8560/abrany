/** Spanish UI strings — org area. Keys are the English source strings; see common.ts for the glossary. */
export const org: Record<string, string> = {
  // page header
  "MY COMPANY": "MI EMPRESA",
  "Team training": "Capacitación del equipo",
  "Sign employees up, assign education with deadlines, track reading time and pass/fail — and white-label the certificates they earn.":
    "Registra a tus empleados, asígnales capacitaciones con fecha límite, sigue su tiempo de lectura y si aprueban o reprueban — y pon tu marca en los certificados que obtienen.",

  // impersonation / instructor
  "Acting as {email} — anything you create is saved to their account.":
    "Actuando como {email} — todo lo que crees se guarda en su cuenta.",
  "Stopping…": "Deteniendo…",
  Stop: "Detener",
  "Instructor — act as a user": "Instructor — actuar como un usuario",
  "Build goals, plans, lessons, and content on behalf of anyone who's signed up. While acting as them, everything you create is saved to their account and generated in their language. Use “Stop” in the top banner to return to yourself.":
    "Crea metas, planes, lecciones y contenido en nombre de cualquier persona registrada. Mientras actúas como ella, todo lo que crees se guarda en su cuenta y se genera en su idioma. Usa “Detener” en el banner superior para volver a tu cuenta.",
  "Loading users…": "Cargando usuarios…",
  "No other users have signed up yet.": "Todavía no se ha registrado ningún otro usuario.",
  "Switching…": "Cambiando…",
  "Act as": "Actuar como",

  // status chips
  Passed: "Aprobado",
  "Passed (late)": "Aprobado (tarde)",
  "Failed — past due": "Reprobado — vencido",
  "In progress": "En curso",
  Assigned: "Asignado",
  "Building course…": "Creando curso…",
  "Build failed": "Falló la creación",
  "Could not load your organization": "No se pudo cargar tu organización",

  // employee view
  "Assigned to you": "Asignado a ti",
  "Education your company assigned. It lives with your own goals — study it the same way.":
    "Capacitación que te asignó tu empresa. Aparece junto a tus propias metas: estúdiala igual que ellas.",
  "Due {date}": "Vence el {date}",
  "{n}d left": "quedan {n} d",
  overdue: "vencido",
  "You're a member. Training your company assigns appears above and with your goals.":
    "Eres miembro. La capacitación que te asigne tu empresa aparece arriba y junto a tus metas.",

  // create org
  "Could not create the organization": "No se pudo crear la organización",
  "Set up your company": "Configura tu empresa",
  "Sign employees up, assign curricula with deadlines, track reading time per section with a clear pass/fail, connect any AI over API/MCP, and put your logo on the certificates.":
    "Registra a tus empleados, asigna programas con fecha límite, sigue el tiempo de lectura por sección con un resultado claro de aprobado o reprobado, conecta cualquier IA por API/MCP y pon tu logo en los certificados.",
  "Company name — e.g. American Iron": "Nombre de la empresa — p. ej., American Iron",
  Create: "Crear",
  "Creating…": "Creando…",
  "Just here to learn? Nothing changes — your personal goals stay yours. If your employer invited you, you joined automatically at signup.":
    "¿Solo vienes a aprender? No cambia nada — tus metas personales siguen siendo tuyas. Si tu empleador te invitó, te uniste automáticamente al registrarte.",

  // admin tabs
  Assignments: "Asignaciones",
  Programs: "Programas",
  "Team ({n})": "Equipo ({n})",
  Branding: "Marca",
  "API & MCP": "API y MCP",
  "Admin · manage training below": "Admin · gestiona la capacitación aquí abajo",

  // programs
  "Could not build the program": "No se pudo crear el programa",
  "Delete the program “{title}”? Employees already assigned keep their courses.":
    "¿Eliminar el programa “{title}”? Los empleados que ya lo tienen asignado conservan sus cursos.",
  "Deployed to {n} employee": "Asignado a {n} empleado",
  "Deployed to {n} employees": "Asignado a {n} empleados",
  ", {n} already had it": ", {n} ya lo tenían",
  "Section content is being written in the background — track it on the Assignments tab.":
    "El contenido de las secciones se está escribiendo en segundo plano — síguelo en la pestaña Asignaciones.",
  "Deploy failed": "No se pudo asignar",
  "Author a course once, then deploy it to a whole team — each employee gets their own copy in their language.":
    "Crea un curso una vez y asígnalo a todo un equipo — cada empleado recibe su propia copia en su idioma.",
  "New program": "Nuevo programa",
  "Not sure what to build? Draft with AI": "¿No sabes qué crear? Haz un borrador con IA",
  "Program title, e.g. New-hire safety onboarding": "Título del programa, p. ej., Inducción de seguridad para nuevos empleados",
  "Who it's for, the level it assumes, and the outcome the team should reach…":
    "Para quién es, qué nivel supone y qué resultado debe alcanzar el equipo…",
  "The AI drafts the full milestone + lesson structure; content is generated per employee on open.":
    "La IA arma toda la estructura de etapas y lecciones; el contenido se genera para cada empleado al abrirlo.",
  "Building…": "Creando…",
  "Build program": "Crear programa",
  "No programs yet — build one to reuse across your team.": "Aún no hay programas — crea uno para reutilizarlo con todo tu equipo.",
  "{n} milestone": "{n} etapa",
  "{n} milestones": "{n} etapas",
  "{n} lesson": "{n} lección",
  "{n} lessons": "{n} lecciones",
  "authored in {lang}": "creado en {lang}",
  Deploy: "Asignar",
  "Deploy to employees": "Asignar a empleados",
  "Optional note employees see": "Nota opcional que verán los empleados",
  "Deploying…": "Asignando…",
  "Deploy to {n}": "Asignar a {n}",

  // team
  "Reset link sent to {email}. It works once and expires in 7 days.":
    "Enlace de restablecimiento enviado a {email}. Funciona una sola vez y vence en 7 días.",
  "Could not send the link": "No se pudo enviar el enlace",
  "Remove {name} ({email}) from the team? Their account and courses stay; you just stop tracking them.":
    "¿Quitar a {name} ({email}) del equipo? Su cuenta y sus cursos se mantienen; solo dejas de darles seguimiento.",
  "Added — they'll see assigned training on their Company page and dashboard. We emailed them a heads-up.":
    "Agregado — verá la capacitación asignada en su página de Empresa y en su Inicio. Le enviamos un correo para avisarle.",
  "Signed up — we emailed them a temporary password. They'll set their own the moment they log in. If it doesn't arrive, use “Send reset link” on their row.":
    "Registrado — le enviamos por correo una contraseña temporal. Creará la suya en cuanto inicie sesión. Si no le llega, usa “Enviar enlace de restablecimiento” en su fila.",
  "Already a member.": "Ya es miembro.",
  "Could not add that person": "No se pudo agregar a esa persona",
  "Could not change the language": "No se pudo cambiar el idioma",
  "Sign up": "Registrar",
  "Their app, lessons and emails will be in this language.": "Su app, sus lecciones y sus correos estarán en este idioma.",
  "Email them a single-use link to set a password — for anyone locked out or who never got their welcome email":
    "Envíale por correo un enlace de un solo uso para crear su contraseña — para quien no puede entrar o nunca recibió su correo de bienvenida",
  "Sending…": "Enviando…",
  "Send reset link": "Enviar enlace de restablecimiento",
  "Pending invites": "Invitaciones pendientes",
  Revoke: "Revocar",
  admin: "admin",
  member: "miembro",

  // assignments
  "Could not update the assignment": "No se pudo actualizar la asignación",
  "Stop tracking “{title}” for {name}? They keep the course; it just disappears from this list.":
    "¿Dejar de dar seguimiento a “{title}” de {name}? Conserva el curso; solo desaparece de esta lista.",
  "Assigned. The course is being built now — the employee opens a ready course with every section written. You'll see it fill in below.":
    "Asignado. El curso se está creando ahora — el empleado abrirá un curso listo con todas las secciones escritas. Lo verás completarse aquí abajo.",
  "Could not create the assignment": "No se pudo crear la asignación",
  "The employee gets the course as a goal of their own; you see time, progress and pass/fail here.":
    "El empleado recibe el curso como una meta propia; aquí ves su tiempo, su progreso y si aprueba o reprueba.",
  "Assign education": "Asignar capacitación",
  "Choose an employee…": "Elige un empleado…",
  "Not sure how to scope it? Draft with AI": "¿No sabes qué alcance darle? Haz un borrador con IA",
  "What should they learn? e.g. OSHA 10 refresher, TIG welding fundamentals":
    "¿Qué debe aprender? p. ej., repaso de OSHA 10, fundamentos de soldadura TIG",
  "Optional context for the AI curriculum (level, focus areas, what 'good' looks like)…":
    "Contexto opcional para el programa de la IA (nivel, áreas de enfoque, cómo se ve un buen resultado)…",
  "Optional note the employee sees, e.g. 'Required before the March site visit'":
    "Nota opcional que verá el empleado, p. ej., 'Obligatorio antes de la visita de marzo'",
  "The AI builds the whole course (plan, sections, exams) in the background from the title and context. Want to author it yourself? Use Programs, or the API & MCP tab.":
    "La IA crea todo el curso (plan, secciones, exámenes) en segundo plano a partir del título y el contexto. ¿Prefieres crearlo tú? Usa Programas o la pestaña API y MCP.",
  "Assigning…": "Asignando…",
  Assign: "Asignar",
  "No assignments yet.": "Aún no hay asignaciones.",
  "Read {time}": "Lectura {time}",
  "Focus {time}": "Enfoque {time}",
  "Final {score}%": "Final {score}%",
  "Build failed: {error}": "Falló la creación: {error}",
  "unknown error": "error desconocido",
  "Change the deadline or note": "Cambiar la fecha límite o la nota",
  "Stop tracking (the employee keeps the course)": "Dejar de dar seguimiento (el empleado conserva el curso)",
  "Note the employee sees": "Nota que verá el empleado",
  "Pushing a deadline out un-fails a past-due assignment. Clear the date for no deadline.":
    "Si amplías la fecha límite, una asignación vencida deja de contar como reprobada. Borra la fecha para no tener fecha límite.",
  "Loading detail…": "Cargando detalle…",
  Section: "Sección",
  Kind: "Tipo",
  "Reading time": "Tiempo de lectura",
  Grade: "Calificación",
  read: "lectura",
  teach: "enseñanza",
  practice: "práctica",
  apply: "aplicación",
  check: "comprobación",
  review: "repaso",
  "final exam": "examen final",
  "midterm exam": "examen parcial",
  "{kind} exam": "examen {kind}",
  exam: "examen",
  "{n} attempt": "{n} intento",
  "{n} attempts": "{n} intentos",

  // branding
  "Logo too large — keep it under 300 KB (PNG/SVG with transparency looks best).":
    "El logo es demasiado grande — que pese menos de 300 KB (PNG/SVG con transparencia se ve mejor).",
  "Saved. New certificates from assigned training now carry your brand.":
    "Guardado. Los nuevos certificados de la capacitación asignada ya llevan tu marca.",
  "Could not save branding": "No se pudo guardar la marca",
  "Certificates earned from training you assign are issued under your brand — your logo and name up top, “in partnership with Abrany” beneath. Employees and anyone verifying see both.":
    "Los certificados de la capacitación que asignas se emiten con tu marca — tu logo y tu nombre arriba, “en alianza con Abrany” debajo. Los empleados y cualquiera que los verifique ven ambos.",
  "Company name": "Nombre de la empresa",
  "Tagline (shown under your name), e.g. Training & Safety": "Eslogan (se muestra bajo tu nombre), p. ej., Capacitación y Seguridad",
  "Replace logo": "Cambiar logo",
  "Upload logo": "Subir logo",
  "logo preview": "vista previa del logo",
  "Your company": "Tu empresa",
  "CERTIFICATE OF COMPLETION": "CERTIFICADO DE FINALIZACIÓN",
  "issued in partnership with ABRANY": "emitido en alianza con ABRANY",
  "Save branding": "Guardar marca",

  // API & MCP
  "Connect Abrany to {claude} (or any MCP client) and just {talk} — “sign up Priya and assign her forklift safety, due Aug 1” — and it enrolls employees, writes the whole curriculum with whatever AI model you run, sets deadlines and reads back live progress. No code required.":
    "Conecta Abrany a {claude} (o a cualquier cliente MCP) y simplemente {talk} — “registra a Priya y asígnale seguridad con montacargas, para el 1 de agosto” — y se encarga de inscribir empleados, escribir todo el programa con el modelo de IA que uses, fijar fechas límite y mostrarte el progreso en vivo. Sin escribir código.",
  "talk to it": "háblale",
  "Your connector link": "Tu enlace de conector",
  "Copied ✓": "Copiado ✓",
  "Copy link": "Copiar enlace",
  "Points at {host} — it updates automatically if you move Abrany to your own domain. The key is baked in, so {password}. Paste it once and Claude stays connected.":
    "Apunta a {host} — se actualiza solo si mueves Abrany a tu propio dominio. La clave va incluida, así que {password}. Pégalo una vez y Claude se queda conectado.",
  "treat this link like a password": "trata este enlace como una contraseña",
  "Add it to Claude — pick your app": "Agrégalo a Claude — elige tu app",
  "Claude.ai or Claude Desktop": "Claude.ai o Claude Desktop",
  "Open {path}.": "Abre {path}.",
  "Settings → Connectors": "Configuración → Conectores",
  "Click {button}.": "Haz clic en {button}.",
  "Add custom connector": "Agregar conector personalizado",
  "Name it {name} and paste the connector link above as the URL.": "Ponle de nombre {name} y pega el enlace de conector de arriba como URL.",
  "Save. Now just ask Claude to enroll people or assign courses.": "Guarda. Ahora solo pídele a Claude que inscriba personas o asigne cursos.",
  "Claude Code (terminal)": "Claude Code (en la terminal)",
  "Copy command": "Copiar comando",
  "One command — it uses a header instead of the link:": "Un solo comando — usa un encabezado en lugar del enlace:",
  "Once connected, Claude can: {team}, {signup}, {assign} (full curriculum + deadline) and {progress} — reading time per section, exam scores and pass/fail.":
    "Una vez conectado, Claude puede: {team}, {signup}, {assign} (programa completo + fecha límite) y {progress} — tiempo de lectura por sección, notas de exámenes y aprobado/reprobado.",
  "see your team": "ver tu equipo",
  "sign up an employee": "registrar a un empleado",
  "assign a course": "asignar un curso",
  "read live progress": "consultar el progreso en vivo",
  "Partner API key": "Clave de API de socio",
  "Rotate the key (the old link and key stop working immediately)": "Renovar la clave (el enlace y la clave anteriores dejan de funcionar de inmediato)",
  Rotate: "Renovar",
  "This is the same key embedded in your connector link. Rotating it disconnects Claude until you paste the new link.":
    "Es la misma clave incluida en tu enlace de conector. Si la renuevas, Claude se desconecta hasta que pegues el enlace nuevo.",
  "Prefer raw HTTP? REST API for developers": "¿Prefieres HTTP directo? API REST para desarrolladores",
  "Example — create an assignment": "Ejemplo — crear una asignación",
  "Also: GET /api/v1/members · POST /api/v1/members · GET /api/v1/assignments · GET /api/v1/assignments/:id (per-section reading time, grades, exams) · GET /api/v1/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD (per member per UTC day: {shape} — pomodoros = completed focus sessions of 25+ minutes, ad-hoc ones included; a member-day with no focus sessions has no row, i.e. zero; both dates are required and inclusive, up to 366 days per call). Authenticate with {auth}.":
    "También: GET /api/v1/members · POST /api/v1/members · GET /api/v1/assignments · GET /api/v1/assignments/:id (tiempo de lectura por sección, calificaciones, exámenes) · GET /api/v1/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD (por miembro y por día UTC: {shape} — pomodoros = sesiones de enfoque completadas de 25+ minutos, incluidas las improvisadas; un día de un miembro sin sesiones de enfoque no tiene fila, es decir, cero; ambas fechas son obligatorias e inclusivas, hasta 366 días por llamada). Autentícate con {auth}.",
};
