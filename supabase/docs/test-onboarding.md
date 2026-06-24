# Test Automático de Onboarding

## Requisitos Previos

1. **Supabase CLI** instalado globalmente:

   ```bash
   npm install -g supabase
   ```

2. **Docker** corriendo (Supabase local usa Docker)

## Uso

### Paso 1: Iniciar Supabase Local

```bash
supabase start
```

Esto levanta la base de datos local con credenciales automáticas.

### Paso 2: Ejecutar el Test

```bash
pnpm test:onboarding
```

### ¿Qué hace el test?

1. **Detecta credenciales automáticamente** mediante `supabase status`
2. **Ejecuta preflight checks** (verifica que no existan duplicados)
3. **Crea un tenant de prueba** con datos aleatorios
4. **Crea un admin** con email único
5. **Verifica** que se crearon correctamente:
   - Tenant
   - Auth user
   - Profile
   - Roles (5 roles por defecto)
   - Asignación de rol administrador
   - Capability grants
6. **Limpia los datos** de prueba al final

### Ejemplo de Salida Exitosa

```
🚀 Starting automated onboarding test...

📡 Detecting Supabase local credentials...
   API URL: http://localhost:54321
   Service Role Key: eyJhbGciOiJIUzI1Ni...

🔍 Running preflight checks...
   ✅ Preflight checks passed

🏗️  Running tenant onboarding flow...
   Tenant: Onboarding Test test-1234567890
   Admin: admin-test-1234567890@test.local
   ✅ Onboarding flow completed

🔎 Verifying persisted state...
   ✅ Tenant created: Onboarding Test test-1234567890 (onboarding-test-test-1234567890)
   ✅ Auth user created: admin-test-1234567890@test.local (uuid-here)
   ✅ Profile created: admin-test-1234567890@test.local (uuid-here)
   ✅ Profile linked to auth user
   ✅ Roles created: 5 roles (administrador, supervisor, operador, mantenimiento, repartidor_de_combustible)
   ✅ administrador has web access
   ✅ supervisor has web access
   ✅ Admin role assignment created
   ✅ Capability grants created: 50 grants

🧹 Cleaning up test data...
   ✅ Test data cleaned up

==================================================
✅ TEST PASSED: All 10 verifications passed
   Tenant ID: uuid-here
   Auth User ID: uuid-here
   Profile ID: uuid-here
   Roles Created: 5
```

### Si falla

```
❌ TEST FAILED: 2 verification(s) failed
   Passed: 8/10
```

Verifica:

- Que Supabase local esté corriendo (`supabase status`)
- Que las migraciones estén aplicadas (`supabase migration up`)
- Que el catálogo de capabilities esté seedeado

## Datos de Prueba

Cada ejecución usa datos únicos (basados en timestamp) para evitar colisiones si el cleanup falla:

- **Tenant slug**: `onboarding-test-test-{timestamp}`
- **Admin email**: `admin-test-{timestamp}@test.local`
- **Contraseña**: `TempPass_test-{timestamp}`

## Troubleshooting

### "Failed to get Supabase status"

```bash
supabase start
```

### "Preflight checks failed: missing capability keys"

Aplica las migraciones:

```bash
supabase migration up
```

### "Duplicate tenant slug"

Si el cleanup previo falló, datos de prueba anteriores pueden quedar. Ejecuta manualmente:

```sql
delete from tenants where slug like 'onboarding-test-%';
```
