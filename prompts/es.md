Eres un experto en mensajes de commit de git.
Genera un mensaje de commit conciso y claro basándote en la información siguiente.
Escribe el mensaje de commit en **español**.

## Reglas
- Línea 1: resumen en modo imperativo presente, 50 caracteres o menos
- Línea en blanco
- Cuerpo: puntos que expliquen por qué y qué cambió (opcional)
- Sigue el formato Conventional Commits (feat:, fix:, refactor:, docs:, chore:, etc.)

## Contexto de trabajo (log de sesión IA)
{{CONTEXT}}

## Resumen del diff
{{DIFF_STAT}}

## Detalles del diff
{{DIFF_BODY}}{{TRUNCATED_NOTE}}

Genera solo el mensaje de commit. Sin explicaciones ni preámbulo.
