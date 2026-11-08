/** Spanish UI strings — errors area. Keys are the English source strings; see common.ts for the glossary. */
export const errors: Record<string, string> = {
  /* ── auth & account ─────────────────────────────────────────── */
  "Admin access required": "Se requiere acceso de administrador",
  "An account with that email already exists": "Ya existe una cuenta con ese correo",
  "Enter a valid email": "Ingresa un correo válido",
  "Password must be at least 8 characters": "La contraseña debe tener al menos 8 caracteres",
  "Wrong email or password": "Correo o contraseña incorrectos",
  "This link is invalid or has expired — request a new one.":
    "Este enlace no es válido o ya expiró. Solicita uno nuevo.",
  "If that email has an account, a reset link is on its way.":
    "Si ese correo tiene una cuenta, te enviaremos un enlace para restablecer tu contraseña.",
  "User not found": "No se encontró el usuario",
  "Pick another user": "Elige otro usuario",
  "Unsupported language": "Idioma no compatible",
  "Bad request": "Solicitud no válida",
  "Confirmation required": "Se requiere confirmación",
  "Unknown action": "Acción desconocida",
  "Invalid status": "Estado no válido",
  "Invalid rating": "Calificación no válida",

  /* ── AI keys & providers ────────────────────────────────────── */
  "Add your AI key in Settings to generate content.":
    "Agrega tu clave de IA en Configuración para generar contenido.",
  "Enter your API key": "Ingresa tu clave de API",
  "Pick a valid provider": "Elige un proveedor válido",
  "OpenRouter needs a model id (e.g. deepseek/deepseek-chat)":
    "OpenRouter necesita un ID de modelo (por ejemplo, deepseek/deepseek-chat)",
  "Could not load OpenRouter models": "No se pudieron cargar los modelos de OpenRouter",
  "That key didn't work — check the key, provider, and model.":
    "Esa clave no funcionó. Revisa la clave, el proveedor y el modelo.",
  "The owner uses the built-in AI — no key needed.":
    "El propietario usa la IA integrada; no se necesita clave.",
  "Illustrations need the built-in AI or your own MiniMax key":
    "Las ilustraciones necesitan la IA integrada o tu propia clave de MiniMax",
  "No server AI key is configured": "No hay ninguna clave de IA configurada en el servidor",
  "Bad image key": "La clave de imágenes no es válida",

  /* ── goals, plans, milestones, lessons ──────────────────────── */
  "Goal not found": "No se encontró la meta",
  "Milestone not found": "No se encontró la etapa",
  "Topic is required": "El tema es obligatorio",
  "Title is required": "El título es obligatorio",
  "Milestone title is required": "El título de la etapa es obligatorio",
  "Every milestone needs a title": "Cada etapa necesita un título",
  "Every lesson needs a title": "Cada lección necesita un título",
  "Give a topic, or pick a course/milestone": "Escribe un tema o elige un curso o una etapa",
  "This goal has no plan yet": "Esta meta todavía no tiene plan",
  "This goal has no plan yet — generate its plan before saving as a program":
    "Esta meta todavía no tiene plan. Genera su plan antes de guardarla como programa.",
  "This course has no plan to copy": "Este curso no tiene un plan para copiar",
  "Give this course a plan before publishing it": "Crea un plan para este curso antes de publicarlo",
  "This course was assigned by your company and can't be renamed.":
    "Este curso lo asignó tu empresa y no se le puede cambiar el nombre.",
  "This course was assigned by your company and its structure can't be edited.":
    "Este curso lo asignó tu empresa y su estructura no se puede editar.",
  "This course was assigned by your company, so its plan can't be rebuilt.":
    "Este curso lo asignó tu empresa, así que su plan no se puede volver a generar.",
  "This course was assigned to you by your company. Ask your training admin to remove the assignment.":
    "Tu empresa te asignó este curso. Pídele a tu administrador de capacitación que quite la asignación.",
  "Lesson not ready": "La lección todavía no está lista",
  "Lesson milestone context missing": "Falta el contexto de la etapa de esta lección",
  "Plan generation failed": "No se pudo generar el plan",
  "Could not break this into lessons": "No se pudo dividir esto en lecciones",
  "Could not prepare the study guide right now.": "No se pudo preparar la guía de estudio en este momento.",
  "Nothing to translate yet": "Todavía no hay nada que traducir",
  "Translation failed": "La traducción falló",

  /* ── coach / generation ─────────────────────────────────────── */
  "Coach is unavailable": "El coach no está disponible",
  "Message is required": "El mensaje es obligatorio",
  "That message is too long — try splitting it up.": "Ese mensaje es demasiado largo. Intenta dividirlo.",
  "Say what you want remembered": "Escribe lo que quieres que se recuerde",
  "Coach returned an unparseable plan": "El coach devolvió un plan que no se pudo leer",
  "Coach returned an empty plan": "El coach devolvió un plan vacío",
  "Coach returned an unparseable program": "El coach devolvió un programa que no se pudo leer",
  "Coach returned an empty program": "El coach devolvió un programa vacío",
  "Coach returned unparseable lessons": "El coach devolvió lecciones que no se pudieron leer",
  "Coach returned no lessons": "El coach no devolvió ninguna lección",
  "Coach returned an unparseable quiz": "El coach devolvió un quiz que no se pudo leer",
  "Coach returned no questions": "El coach no devolvió ninguna pregunta",
  "Coach returned an unparseable exam": "El coach devolvió un examen que no se pudo leer",
  "Coach returned no exam questions": "El coach no devolvió preguntas para el examen",
  "Coach returned unparseable questions": "El coach devolvió preguntas que no se pudieron leer",
  "Coach returned an unparseable grade": "El coach devolvió una calificación que no se pudo leer",
  "Coach returned an unparseable practice set": "El coach devolvió una práctica que no se pudo leer",
  "Coach returned too few problems": "El coach devolvió muy pocos ejercicios",
  "Coach returned an unparseable check": "El coach devolvió una revisión que no se pudo leer",
  "Coach returned an unparseable problem": "El coach devolvió un ejercicio que no se pudo leer",
  "Coach returned no problem": "El coach no devolvió ningún ejercicio",
  "Coach returned an unparseable outline": "El coach devolvió un esquema que no se pudo leer",
  "Coach returned no chapters": "El coach no devolvió ningún capítulo",

  /* ── quizzes, exams, practice ───────────────────────────────── */
  "No answers": "No hay respuestas",
  "Write an answer first.": "Primero escribe una respuesta.",
  "Could not build a quiz": "No se pudo crear el quiz",
  "Could not grade the quiz": "No se pudo calificar el quiz",
  "Could not grade the exam": "No se pudo calificar el examen",
  "Could not write the exam questions right now.": "No se pudieron escribir las preguntas del examen en este momento.",
  "Start the exam first.": "Primero inicia el examen.",
  "Pass the final exam to earn your certificate.": "Aprueba el examen final para obtener tu certificado.",
  "Prepare the course sections first — this exam needs their content.":
    "Primero prepara las secciones del curso; este examen necesita su contenido.",
  "This course has no plan yet.": "Este curso todavía no tiene plan.",
  "Break the milestones into sections first.": "Primero divide las etapas en secciones.",
  "Could not build a practice set": "No se pudo crear la práctica",
  "Could not check the answer": "No se pudo revisar la respuesta",
  "Could not write a variant": "No se pudo escribir una variante",
  "No such problem": "No existe ese ejercicio",

  /* ── books, workshop, drafts ────────────────────────────────── */
  "A brief is required": "Se necesita una descripción breve",
  "Could not outline the book": "No se pudo crear el esquema del libro",
  "Write at least one chapter before downloading.": "Escribe al menos un capítulo antes de descargar.",
  "Describe the job or the problem in a sentence or two":
    "Describe el trabajo o el problema en una o dos oraciones",
  "The manual came back with no steps": "El manual llegó sin ningún paso",
  "The coach returned an unreadable manual": "El coach devolvió un manual que no se pudo leer",
  "Unknown surface": "Sección desconocida",
  "The assistant is unavailable — you can fill the form by hand.":
    "El asistente no está disponible. Puedes llenar el formulario a mano.",
  "text required": "El texto es obligatorio",
  "durationSec is required": "durationSec es obligatorio",

  /* ── organization, programs, assignments ────────────────────── */
  "Company name is required": "El nombre de la empresa es obligatorio",
  "Logo must be an image": "El logo debe ser una imagen",
  "Logo too large — keep it under ~300 KB": "El logo es demasiado grande. Debe pesar menos de ~300 KB",
  "You already belong to an organization": "Ya perteneces a una organización",
  "Not a member of this organization": "No eres miembro de esta organización",
  "That person is not a member of your organization": "Esa persona no es miembro de tu organización",
  "Employee not found — sign them up to your organization first":
    "No se encontró el empleado. Primero regístralo en tu organización.",
  "Pick at least one employee": "Elige al menos un empleado",
  "A program title is required": "El título del programa es obligatorio",
  "Program not found": "No se encontró el programa",
  "Could not build the program": "No se pudo crear el programa",
  "Assignment not found": "No se encontró la asignación",
  "Assignment title is required": "El título de la asignación es obligatorio",
  "dueAt must be an ISO date (e.g. 2026-08-01)": "dueAt debe ser una fecha ISO (por ejemplo, 2026-08-01)",
  "from and to are required as ISO dates (e.g. 2026-08-01)":
    "from y to son obligatorios como fechas ISO (por ejemplo, 2026-08-01)",
  "from must be on or before to": "from debe ser igual o anterior a to",
  "Keep the range to 366 days or fewer": "El rango debe ser de 366 días o menos",
  "Invalid or missing API key": "Falta la clave de API o no es válida",
  "Invalid or missing API key. Send Authorization: Bearer abr_org_...":
    "Falta la clave de API o no es válida. Envía Authorization: Bearer abr_org_...",

  /* ── community & marketplace ────────────────────────────────── */
  "Forum not found": "No se encontró el foro",
  "Thread not found": "No se encontró el tema",
  "Give your thread a title": "Ponle un título a tu tema",
  "Write something first": "Primero escribe algo",
  "Not yours to delete": "No puedes eliminar esto porque no es tuyo",
  "Listing not found": "No se encontró la publicación",
};
