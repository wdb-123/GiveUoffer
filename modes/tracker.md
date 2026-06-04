# Modo: tracker — Tracker de Aplicaciones

Lee y muestra `data/applications.md`.

Para cola de acciones, vencimientos y eventos historicos, usa:

```bash
node tracker-workflow.mjs --summary
```

Para registrar un evento sin cambiar el formato principal de `applications.md`:

```bash
node tracker-workflow.mjs --add-event {num} --event applied --next-action "Follow up" --due YYYY-MM-DD
```

**Formato del tracker:**
```markdown
| # | Fecha | Empresa | Rol | Score | Estado | PDF | Report |
```

Estados posibles: `Evaluada` → `Aplicado` → `Respondido` → `Contacto` → `Entrevista` → `Oferta` / `Rechazada` / `Descartada` / `NO APLICAR`

- `Aplicado` = el candidato envió su candidatura
- `Respondido` = Un recruiter/empresa contactó y el candidato respondió (inbound)
- `Contacto` = El candidato contactó proactivamente a alguien de la empresa (outbound, ej: LinkedIn power move)

Si el usuario pide actualizar un estado, editar la fila correspondiente.

Mostrar también estadísticas:
- Total de aplicaciones
- Por estado
- Score promedio
- % con PDF generado
- % con report generado
