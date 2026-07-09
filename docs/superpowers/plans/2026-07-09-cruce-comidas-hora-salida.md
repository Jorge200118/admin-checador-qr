# Cruce de vales de comida × hora de salida — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un script Python (`cruce_comidas_salida.py`) que, dado un rango de fechas, cruza los vales de comida (`rnd_reembolsos`) con la última hora de salida del checador y genera un Excel marcando quién cumple la regla de pago (salió ≥ 17:30).

**Architecture:** Script de un solo archivo que replica el patrón de los `auditoria_*.py` existentes: acceso a Supabase por REST con `urllib` (paginado `limit`/`offset`), identificación del empleado por cascada de matching de nombre (normalizado, sin acentos) usando `rnd_empleados` como puente hacia el checador, y salida a Excel con `openpyxl` reusando los estilos ya definidos en el proyecto. Las funciones puras (normalización, matching, clasificación) se prueban con un script de pruebas en Python plano.

**Tech Stack:** Python 3.13, `openpyxl` 3.1.5, `urllib` (stdlib), Supabase REST. Sin dependencias nuevas.

---

## Referencia rápida del spec

Spec completo: `docs/superpowers/specs/2026-07-09-cruce-comidas-hora-salida-design.md`

Regla: un vale de comida cumple si el empleado tiene la última **SALIDA >= 17:30** ese día.
Fuentes: `rnd_reembolsos` (vales, concepto contiene "COMIDA", `empleado_id` siempre NULL,
identificador = `nombre_beneficiario` texto libre), `rnd_empleados` (nombre→codigo),
`empleados` (checador, codigo_empleado→id), `registros` (SALIDA por día).
Fechas corruptas: año `0026` → `2026`. Estados: ✅ Cumple / ❌ No cumple / ⚠️ Revisar.

## Convenciones del proyecto a reusar (de `auditoria_anual.py`)

- Config al inicio del archivo:
  `SUPABASE_URL = 'https://uqncsqstpcynjxnjhrqu.supabase.co'`,
  `ANON_KEY = 'sb_publishable_bY6BY3wa5Xm2JCG2fy4F3g_fFgS5OsA'`.
- `supabase_get(path, params)` con `urllib` (copiar verbatim, ver Task 2).
- Estilos openpyxl: `HEADER_FILL='1F4E78'`, `OK_FILL='D5F5E3'`, `WARN_FILL='FCF3CF'`,
  `BAD_FILL='F5B7B1'`, `HEADER_FONT=Font(bold=True,color='FFFFFF')`, `BORDER` con `THIN`.
- Códigos de empleado se normalizan con `.strip().zfill(4)` en el checador — **ojo:** los
  códigos de `rnd_empleados` NO siempre son de 4 dígitos (`01111111`, `10000`), así que el
  match `rnd_empleados.codigo` ↔ `empleados.codigo_empleado` se hace probando **ambas**
  formas (tal cual y con `zfill(4)`).

## File Structure

- **Create:** `cruce_comidas_salida.py` — el script completo (config, acceso a datos,
  normalización, matching en cascada, clasificación, generación de Excel, `main`).
- **Create:** `test_cruce_comidas.py` — pruebas de las funciones puras (normalización,
  matching, clasificación, parseo de fecha). Se ejecuta con `python test_cruce_comidas.py`
  (sin framework; asserts + prints, estilo ligero acorde al proyecto que no usa pytest).

Todo en la raíz del proyecto `V2 checador-system ADMIN`, junto a los `auditoria_*.py`.

---

### Task 1: Esqueleto del script + config

**Files:**
- Create: `cruce_comidas_salida.py`

- [ ] **Step 1: Crear el archivo con imports, config y docstring**

```python
"""
Cruce de vales de comida x hora de salida del checador.

Dado un rango de fechas:
  1. Lee los vales de comida (rnd_reembolsos, concepto contiene 'COMIDA').
  2. Identifica al empleado por nombre_beneficiario (cascada: rnd_empleados -> checador).
  3. Busca su ultima SALIDA de ese dia en registros.
  4. Marca Cumple (salida >= 17:30) / No cumple / Revisar, y genera un Excel.

Uso:
  python cruce_comidas_salida.py 2026-07-01 2026-07-08
  (sin argumentos usa FECHA_INICIO / FECHA_FIN de abajo)
"""
import sys
import json
import unicodedata
from datetime import datetime, date, time
from urllib.request import Request, urlopen
from urllib.parse import quote

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# ===== Config =====
SUPABASE_URL = 'https://uqncsqstpcynjxnjhrqu.supabase.co'
ANON_KEY = 'sb_publishable_bY6BY3wa5Xm2JCG2fy4F3g_fFgS5OsA'

# Rango por defecto si no se pasan argumentos de linea de comando
FECHA_INICIO = '2026-07-01'
FECHA_FIN = '2026-07-08'

# Regla de negocio: hora minima de salida para que el vale cuente
HORA_MINIMA_SALIDA = time(17, 30)

OUTPUT = r'C:/Users/USUARIO/Downloads/cruce_comidas_{inicio}_{fin}.xlsx'
```

- [ ] **Step 2: Verificar que el archivo importa sin error**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python -c "import cruce_comidas_salida"`
Expected: sin salida (importa limpio).

- [ ] **Step 3: Commit**

```bash
git add cruce_comidas_salida.py
git commit -m "feat(comidas): esqueleto del script de cruce comidas x salida"
```

---

### Task 2: Acceso a Supabase (copiar patrón existente)

**Files:**
- Modify: `cruce_comidas_salida.py`

- [ ] **Step 1: Añadir `supabase_get` (verbatim del proyecto)**

```python
# ===== Supabase =====
def supabase_get(path, params=None):
    qs = ''
    if params:
        qs = '?' + '&'.join(f'{k}={quote(str(v), safe="*.,()=:")}' for k, v in params.items())
    url = f'{SUPABASE_URL}/rest/v1/{path}{qs}'
    req = Request(url, headers={
        'apikey': ANON_KEY,
        'Authorization': f'Bearer {ANON_KEY}',
        'Accept': 'application/json',
    })
    with urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def supabase_get_all(path, params):
    """Trae todas las filas paginando de 1000 en 1000."""
    todos = []
    offset = 0
    while True:
        p = dict(params)
        p['limit'] = 1000
        p['offset'] = offset
        chunk = supabase_get(path, p)
        todos.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return todos
```

- [ ] **Step 2: Verificar conexión real (smoke test manual)**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python -c "import cruce_comidas_salida as c; print(len(c.supabase_get('empleados', {'select':'id','limit':1})))"`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add cruce_comidas_salida.py
git commit -m "feat(comidas): acceso a Supabase por REST con paginado"
```

---

### Task 3: Normalización de nombres (TDD)

**Files:**
- Modify: `cruce_comidas_salida.py`
- Create: `test_cruce_comidas.py`

- [ ] **Step 1: Escribir el test que falla**

En `test_cruce_comidas.py`:

```python
import cruce_comidas_salida as c


def test_normalizar_nombre():
    # mayusculas, sin acentos, espacios colapsados, sin puntuacion sobrante
    assert c.norm_nombre('  José  Pérez ') == 'JOSE PEREZ'
    assert c.norm_nombre('JASIVE ANAIS TRASVIÑA OSUNA') == 'JASIVE ANAIS TRASVINA OSUNA'
    assert c.norm_nombre('Luis   Roberto Lopez Galaviz') == 'LUIS ROBERTO LOPEZ GALAVIZ'
    assert c.norm_nombre(None) == ''
    print('OK test_normalizar_nombre')


if __name__ == '__main__':
    test_normalizar_nombre()
    print('TODOS OK')
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: FALLA con `AttributeError: module 'cruce_comidas_salida' has no attribute 'norm_nombre'`

- [ ] **Step 3: Implementar `norm_nombre`**

```python
# ===== Normalizacion =====
def norm_nombre(s):
    """Mayusculas, sin acentos, espacios colapsados. '' si es None."""
    if not s:
        return ''
    s = unicodedata.normalize('NFKD', str(s))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = s.upper()
    return ' '.join(s.split())
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: `OK test_normalizar_nombre` y `TODOS OK`

- [ ] **Step 5: Commit**

```bash
git add cruce_comidas_salida.py test_cruce_comidas.py
git commit -m "feat(comidas): normalizacion de nombres (sin acentos, mayusc)"
```

---

### Task 4: Normalizar fecha de vale (año corrupto 0026) — TDD

**Files:**
- Modify: `cruce_comidas_salida.py`
- Modify: `test_cruce_comidas.py`

- [ ] **Step 1: Añadir test**

En `test_cruce_comidas.py`, añadir función y llamarla en `__main__`:

```python
def test_fecha_vale():
    from datetime import date
    assert c.parse_fecha_vale('2026-07-08') == date(2026, 7, 8)
    assert c.parse_fecha_vale('0026-06-09') == date(2026, 6, 9)  # año corrupto
    assert c.parse_fecha_vale('bad') is None
    assert c.parse_fecha_vale(None) is None
    print('OK test_fecha_vale')
```

Y en `__main__` agregar `test_fecha_vale()` antes de `print('TODOS OK')`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: FALLA con `AttributeError: ... 'parse_fecha_vale'`

- [ ] **Step 3: Implementar `parse_fecha_vale`**

```python
def parse_fecha_vale(s):
    """Parsea 'YYYY-MM-DD'. Corrige año corrupto tipo 0026 -> 2026. None si invalida."""
    if not s:
        return None
    try:
        y, m, d = str(s)[:10].split('-')
        y = int(y)
        if y < 100:          # 0026 -> 2026
            y += 2000
        return date(y, int(m), int(d))
    except (ValueError, TypeError):
        return None
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: `OK test_fecha_vale` y `TODOS OK`

- [ ] **Step 5: Commit**

```bash
git add cruce_comidas_salida.py test_cruce_comidas.py
git commit -m "feat(comidas): parseo de fecha con correccion de anio corrupto"
```

---

### Task 5: Índices de empleados (rnd_empleados y checador)

**Files:**
- Modify: `cruce_comidas_salida.py`

- [ ] **Step 1: Implementar la carga e indexado de empleados**

```python
# ===== Carga de catalogos =====
def cargar_checador():
    """Empleados del checador. Devuelve:
       by_code: {codigo_normalizado -> emp}, by_name: {nombre_norm -> [emp,...]}."""
    emps = supabase_get('empleados', {
        'select': 'id,codigo_empleado,nombre,apellido,horario_id,activo'
    })
    by_code, by_name = {}, {}
    for e in emps:
        cod = e.get('codigo_empleado')
        if cod is not None:
            cod = str(cod).strip()
            by_code[cod] = e
            by_code[cod.zfill(4)] = e   # tolera codigos con y sin padding
        full1 = norm_nombre(f"{e.get('nombre','')} {e.get('apellido','')}")
        full2 = norm_nombre(f"{e.get('apellido','')} {e.get('nombre','')}")
        for k in {full1, full2}:
            if k:
                by_name.setdefault(k, []).append(e)
    return by_code, by_name


def cargar_rnd_empleados():
    """rnd_empleados. Devuelve {nombre_norm -> codigo}."""
    res = supabase_get('rnd_empleados', {'select': 'codigo,nombre'})
    by_name = {}
    for r in res:
        k = norm_nombre(r.get('nombre'))
        if k and r.get('codigo'):
            by_name.setdefault(k, str(r['codigo']).strip())
    return by_name
```

- [ ] **Step 2: Smoke test manual**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python -c "import cruce_comidas_salida as c; bc,bn=c.cargar_checador(); print('checador codes', len(bc), 'names', len(bn)); print('rnd', len(c.cargar_rnd_empleados()))"`
Expected: números > 0 (aprox. checador codes ~300+, rnd ~260).

- [ ] **Step 3: Commit**

```bash
git add cruce_comidas_salida.py
git commit -m "feat(comidas): carga e indexado de empleados (checador + rnd)"
```

---

### Task 6: Matching en cascada del empleado (TDD)

**Files:**
- Modify: `cruce_comidas_salida.py`
- Modify: `test_cruce_comidas.py`

- [ ] **Step 1: Añadir test con índices simulados**

En `test_cruce_comidas.py`:

```python
def test_identificar_empleado():
    # Simula indices
    emp = {'id': 10, 'codigo_empleado': '1218', 'nombre': 'JASIVE ANAIS',
           'apellido': 'TRASVINA OSUNA', 'horario_id': 2}
    checador_by_code = {'1218': emp}
    checador_by_name = {'JASIVE ANAIS TRASVINA OSUNA': [emp]}
    rnd_by_name = {'JASIVE ANAIS TRASVINA OSUNA': '1218'}

    # 1) via rnd_empleados (camino principal)
    r = c.identificar_empleado('JASIVE ANAIS TRASVIÑA OSUNA',
                               rnd_by_name, checador_by_code, checador_by_name)
    assert r['emp'] is emp and r['metodo'] == 'rnd', r

    # 2) directo por nombre en checador (no esta en rnd)
    r = c.identificar_empleado('JASIVE ANAIS TRASVINA OSUNA',
                               {}, checador_by_code, checador_by_name)
    assert r['emp'] is emp and r['metodo'] == 'checador', r

    # 3) aproximado por tokens (nombre parcial) -> dudoso
    r = c.identificar_empleado('JASIVE TRASVINA',
                               {}, checador_by_code, checador_by_name)
    assert r['emp'] is emp and r['metodo'] == 'aprox', r

    # 4) sin identificar
    r = c.identificar_empleado('PROVEEDOR EXTERNO SA',
                               {}, checador_by_code, checador_by_name)
    assert r['emp'] is None and r['metodo'] == 'sin_id', r
    print('OK test_identificar_empleado')
```

Añadir `test_identificar_empleado()` en `__main__`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: FALLA con `AttributeError: ... 'identificar_empleado'`

- [ ] **Step 3: Implementar `identificar_empleado`**

```python
# ===== Matching en cascada =====
def _match_aproximado(nombre_norm, checador_by_name):
    """Devuelve emp si comparte >=2 tokens con un unico candidato dominante, si no None."""
    tokens = set(nombre_norm.split())
    if len(tokens) < 2:
        return None
    mejor, mejor_score, empatados = None, 0, 0
    for cand_norm, emps in checador_by_name.items():
        score = len(tokens & set(cand_norm.split()))
        if score > mejor_score:
            mejor, mejor_score, empatados = emps[0], score, 1
        elif score == mejor_score and score > 0:
            empatados += 1
    if mejor_score >= 2 and empatados == 1:
        return mejor
    return None


def identificar_empleado(nombre_benef, rnd_by_name, checador_by_code, checador_by_name):
    """Cascada: rnd_empleados -> checador por nombre -> aproximado -> sin_id.
       Devuelve {'emp': emp|None, 'metodo': 'rnd'|'checador'|'aprox'|'sin_id'}."""
    nn = norm_nombre(nombre_benef)
    if not nn:
        return {'emp': None, 'metodo': 'sin_id'}

    # 1) via rnd_empleados -> codigo -> checador
    codigo = rnd_by_name.get(nn)
    if codigo:
        emp = checador_by_code.get(codigo) or checador_by_code.get(codigo.zfill(4))
        if emp:
            return {'emp': emp, 'metodo': 'rnd'}

    # 2) directo por nombre completo en checador
    cands = checador_by_name.get(nn)
    if cands and len(cands) == 1:
        return {'emp': cands[0], 'metodo': 'checador'}

    # 3) aproximado por tokens
    emp = _match_aproximado(nn, checador_by_name)
    if emp:
        return {'emp': emp, 'metodo': 'aprox'}

    # 4) sin identificar
    return {'emp': None, 'metodo': 'sin_id'}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: `OK test_identificar_empleado` y `TODOS OK`

- [ ] **Step 5: Commit**

```bash
git add cruce_comidas_salida.py test_cruce_comidas.py
git commit -m "feat(comidas): matching en cascada del empleado por nombre"
```

---

### Task 7: Última salida por empleado-día + clasificación (TDD)

**Files:**
- Modify: `cruce_comidas_salida.py`
- Modify: `test_cruce_comidas.py`

- [ ] **Step 1: Añadir test de clasificación**

En `test_cruce_comidas.py`:

```python
def test_clasificar():
    from datetime import datetime, date
    # ultima_salida es datetime o None
    assert c.clasificar(datetime(2026,7,8,18,1))['estado'] == 'CUMPLE'
    assert c.clasificar(datetime(2026,7,8,17,30))['estado'] == 'CUMPLE'   # limite inclusivo
    assert c.clasificar(datetime(2026,7,8,16,40))['estado'] == 'NO_CUMPLE'
    r = c.clasificar(None)
    assert r['estado'] == 'NO_CUMPLE' and 'Sin checada' in r['nota']
    print('OK test_clasificar')


def test_ultima_salida():
    from datetime import date
    regs = [
        {'empleado_id': 10, 'tipo_registro': 'ENTRADA', 'fecha_hora': '2026-07-08 08:03:00'},
        {'empleado_id': 10, 'tipo_registro': 'SALIDA',  'fecha_hora': '2026-07-08 13:04:00'},
        {'empleado_id': 10, 'tipo_registro': 'SALIDA',  'fecha_hora': '2026-07-08 18:01:00'},
        {'empleado_id': 10, 'tipo_registro': 'SALIDA',  'fecha_hora': '2026-07-07 17:00:00'},
    ]
    idx = c.indexar_salidas(regs)
    assert idx[(10, date(2026,7,8))].hour == 18
    assert idx[(10, date(2026,7,7))].hour == 17
    assert (10, date(2026,7,6)) not in idx
    print('OK test_ultima_salida')
```

Añadir ambas en `__main__`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: FALLA con `AttributeError: ... 'clasificar'`

- [ ] **Step 3: Implementar `indexar_salidas` y `clasificar`**

```python
# ===== Salidas y clasificacion =====
def _parse_ts(s):
    """Parsea 'YYYY-MM-DD HH:MM:SS[.ffffff]' o con 'T'. None si falla."""
    if not s:
        return None
    txt = str(s).replace('T', ' ')[:19]
    try:
        return datetime.strptime(txt, '%Y-%m-%d %H:%M:%S')
    except ValueError:
        return None


def indexar_salidas(registros):
    """{(empleado_id, date) -> datetime de la ULTIMA salida de ese dia}."""
    idx = {}
    for r in registros:
        if r.get('tipo_registro') != 'SALIDA':
            continue
        ts = _parse_ts(r.get('fecha_hora'))
        if ts is None:
            continue
        key = (r.get('empleado_id'), ts.date())
        if key not in idx or ts > idx[key]:
            idx[key] = ts
    return idx


def clasificar(ultima_salida):
    """CUMPLE si ultima_salida >= HORA_MINIMA_SALIDA; NO_CUMPLE en otro caso o si None."""
    if ultima_salida is None:
        return {'estado': 'NO_CUMPLE', 'nota': 'Sin checada de salida ese dia'}
    if ultima_salida.time() >= HORA_MINIMA_SALIDA:
        return {'estado': 'CUMPLE', 'nota': ''}
    return {'estado': 'NO_CUMPLE', 'nota': 'Salio antes de 17:30'}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: `OK test_clasificar`, `OK test_ultima_salida`, `TODOS OK`

- [ ] **Step 5: Commit**

```bash
git add cruce_comidas_salida.py test_cruce_comidas.py
git commit -m "feat(comidas): ultima salida por dia y clasificacion cumple/no cumple"
```

---

### Task 8: Carga de vales de comida y de registros del rango

**Files:**
- Modify: `cruce_comidas_salida.py`

- [ ] **Step 1: Implementar la carga de datos del rango**

```python
# ===== Carga de datos del rango =====
def cargar_vales_comida(fi, ff):
    """Vales con concepto que contiene 'comida' (case-insensitive), en el rango.
       Filtra por fecha ya corregida (año corrupto). Devuelve lista de dicts."""
    # 'comida' cubre COMIDAS/comida/Comida via ilike. Traemos amplio y filtramos por fecha en Python
    # para tolerar años corruptos (0026) que romperían un filtro de fecha en el servidor.
    res = supabase_get_all('rnd_reembolsos', {
        'select': 'fecha,nombre_beneficiario,monto,estado,concepto',
        'concepto': 'ilike.*comida*',
        'order': 'fecha.asc',
    })
    out = []
    for v in res:
        f = parse_fecha_vale(v.get('fecha'))
        if f is None or f < fi or f > ff:
            continue
        v['_fecha'] = f
        out.append(v)
    return out


def cargar_registros_salida(fi, ff):
    """Registros SALIDA del rango. Trae un dia extra por si el año corrupto desplaza fechas."""
    return supabase_get_all('registros', {
        'select': 'empleado_id,tipo_registro,fecha_hora',
        'tipo_registro': 'eq.SALIDA',
        'fecha_hora': f'gte.{fi}T00:00:00',
        'and': f'(fecha_hora.lte.{ff}T23:59:59)',
        'order': 'fecha_hora.asc',
    })
```

- [ ] **Step 2: Smoke test manual**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python -c "import cruce_comidas_salida as c; from datetime import date; v=c.cargar_vales_comida(date(2026,7,1),date(2026,7,8)); print('vales', len(v)); print(v[0] if v else 'sin vales')"`
Expected: `vales` con un número > 0 y un dict de ejemplo con `_fecha`.

- [ ] **Step 3: Commit**

```bash
git add cruce_comidas_salida.py
git commit -m "feat(comidas): carga de vales de comida y salidas del rango"
```

---

### Task 9: Construcción de filas del reporte (TDD de integración de la lógica)

**Files:**
- Modify: `cruce_comidas_salida.py`
- Modify: `test_cruce_comidas.py`

- [ ] **Step 1: Añadir test de `construir_filas`**

En `test_cruce_comidas.py`:

```python
def test_construir_filas():
    from datetime import date, datetime
    emp = {'id': 10, 'codigo_empleado': '1218', 'nombre': 'JASIVE ANAIS',
           'apellido': 'TRASVINA OSUNA', 'horario_id': 2}
    vales = [
        {'nombre_beneficiario': 'JASIVE ANAIS TRASVIÑA OSUNA', 'monto': '100.00',
         'estado': 'aprobado', '_fecha': date(2026,7,8)},
        {'nombre_beneficiario': 'PROVEEDOR EXTERNO', 'monto': '500.00',
         'estado': 'aprobado', '_fecha': date(2026,7,8)},
        # duplicado del mismo empleado el mismo dia -> anomalia
        {'nombre_beneficiario': 'JASIVE ANAIS TRASVIÑA OSUNA', 'monto': '80.00',
         'estado': 'aprobado', '_fecha': date(2026,7,8)},
    ]
    rnd_by_name = {'JASIVE ANAIS TRASVINA OSUNA': '1218'}
    checador_by_code = {'1218': emp}
    checador_by_name = {'JASIVE ANAIS TRASVINA OSUNA': [emp]}
    salidas = {(10, date(2026,7,8)): datetime(2026,7,8,18,1)}

    filas = c.construir_filas(vales, rnd_by_name, checador_by_code, checador_by_name, salidas)
    assert len(filas) == 3
    f0 = filas[0]
    assert f0['estado'] == 'CUMPLE'
    assert f0['codigo'] == '1218'
    assert '18:01' in f0['ultima_salida_str']
    # el proveedor externo -> REVISAR
    ext = [f for f in filas if f['nombre_vale'] == 'PROVEEDOR EXTERNO'][0]
    assert ext['estado'] == 'REVISAR'
    # duplicado marcado en nota
    dup = [f for f in filas if f['monto'] == 80.0][0]
    assert 'duplicado' in dup['nota'].lower()
    print('OK test_construir_filas')
```

Añadir `test_construir_filas()` en `__main__`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: FALLA con `AttributeError: ... 'construir_filas'`

- [ ] **Step 3: Implementar `construir_filas`**

```python
# ===== Construccion de filas del reporte =====
def _to_float(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def construir_filas(vales, rnd_by_name, checador_by_code, checador_by_name, salidas):
    """Una fila por vale. Detecta duplicados empleado-dia. Devuelve lista de dicts."""
    filas = []
    vistos = {}  # (emp_id, fecha) -> conteo, para marcar duplicados
    for v in vales:
        nombre_vale = v.get('nombre_beneficiario') or ''
        fecha = v.get('_fecha')
        monto = _to_float(v.get('monto'))
        ident = identificar_empleado(nombre_vale, rnd_by_name,
                                     checador_by_code, checador_by_name)
        emp = ident['emp']
        metodo = ident['metodo']

        if emp is None:
            filas.append({
                'fecha': fecha, 'nombre_vale': nombre_vale, 'codigo': '',
                'empleado_checador': '', 'monto': monto, 'estado_vale': v.get('estado', ''),
                'ultima_salida_str': '', 'cumple_str': '',
                'estado': 'REVISAR', 'nota': 'No se pudo identificar al empleado',
            })
            continue

        ultima = salidas.get((emp['id'], fecha))
        clas = clasificar(ultima)
        nombre_checador = norm_nombre(f"{emp.get('nombre','')} {emp.get('apellido','')}")

        # duplicado empleado-dia
        key = (emp['id'], fecha)
        vistos[key] = vistos.get(key, 0) + 1
        nota = clas['nota']
        estado = clas['estado']
        if vistos[key] > 1:
            estado = 'REVISAR'
            nota = (nota + ' | ' if nota else '') + 'Vale duplicado el mismo dia (revisar)'
        if metodo == 'aprox':
            estado = 'REVISAR' if estado != 'CUMPLE' else estado
            nota = (nota + ' | ' if nota else '') + 'Identificado por aproximacion (verificar)'

        filas.append({
            'fecha': fecha, 'nombre_vale': nombre_vale,
            'codigo': str(emp.get('codigo_empleado', '')),
            'empleado_checador': nombre_checador, 'monto': monto,
            'estado_vale': v.get('estado', ''),
            'ultima_salida_str': ultima.strftime('%Y-%m-%d %H:%M') if ultima else '',
            'cumple_str': 'SI' if clas['estado'] == 'CUMPLE' else 'NO',
            'estado': estado, 'nota': nota,
        })
    return filas
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: `OK test_construir_filas` y `TODOS OK`

- [ ] **Step 5: Commit**

```bash
git add cruce_comidas_salida.py test_cruce_comidas.py
git commit -m "feat(comidas): construccion de filas del reporte con deteccion de duplicados"
```

---

### Task 10: Generación del Excel

**Files:**
- Modify: `cruce_comidas_salida.py`

- [ ] **Step 1: Implementar `generar_excel`**

```python
# ===== Excel =====
HEADER_FILL = PatternFill('solid', fgColor='1F4E78')
HEADER_FONT = Font(bold=True, color='FFFFFF', size=11)
OK_FILL = PatternFill('solid', fgColor='D5F5E3')
WARN_FILL = PatternFill('solid', fgColor='FCF3CF')
BAD_FILL = PatternFill('solid', fgColor='F5B7B1')
THIN = Side(border_style='thin', color='BDC3C7')
BORDER = Border(top=THIN, left=THIN, right=THIN, bottom=THIN)
MONEY_FMT = '$#,##0.00'

FILL_POR_ESTADO = {'CUMPLE': OK_FILL, 'NO_CUMPLE': BAD_FILL, 'REVISAR': WARN_FILL}
ORDEN_ESTADO = {'CUMPLE': 0, 'NO_CUMPLE': 1, 'REVISAR': 2}

COLUMNAS = ['Fecha', 'Nombre en vale', 'Codigo', 'Empleado (checador)', 'Monto',
            'Estado vale', 'Ultima salida', 'Salio >= 5:30', 'Estado cruce', 'Notas']


def generar_excel(filas, fi, ff, ruta):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Comidas x Salida'

    # Titulo
    ws['A1'] = f'Cruce vales de comida x hora de salida  ({fi} a {ff})'
    ws['A1'].font = Font(bold=True, size=16, color='1F4E78')
    ws.append([])

    # Encabezados (fila 3)
    ws.append(COLUMNAS)
    hrow = ws.max_row
    for col in range(1, len(COLUMNAS) + 1):
        cell = ws.cell(row=hrow, column=col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal='center', vertical='center')
        cell.border = BORDER
    ws.freeze_panes = f'A{hrow + 1}'

    # Filas ordenadas por fecha y estado
    filas_ord = sorted(filas, key=lambda f: (f['fecha'] or date.min,
                                             ORDEN_ESTADO.get(f['estado'], 9)))
    for f in filas_ord:
        ws.append([
            f['fecha'].strftime('%Y-%m-%d') if f['fecha'] else '',
            f['nombre_vale'], f['codigo'], f['empleado_checador'], f['monto'],
            f['estado_vale'], f['ultima_salida_str'], f['cumple_str'],
            f['estado'], f['nota'],
        ])
        r = ws.max_row
        fill = FILL_POR_ESTADO.get(f['estado'])
        for col in range(1, len(COLUMNAS) + 1):
            cell = ws.cell(row=r, column=col)
            cell.border = BORDER
            if fill:
                cell.fill = fill
        ws.cell(row=r, column=5).number_format = MONEY_FMT

    # Totales
    ws.append([])
    base = ws.max_row + 1
    def _tot(estado):
        sel = [f for f in filas if f['estado'] == estado]
        return len(sel), sum(f['monto'] for f in sel)
    for estado, etiqueta in [('CUMPLE', 'CUMPLEN (pagar)'),
                             ('NO_CUMPLE', 'NO CUMPLEN'),
                             ('REVISAR', 'A REVISAR')]:
        n, suma = _tot(estado)
        ws.cell(row=base, column=1, value=etiqueta).font = Font(bold=True)
        ws.cell(row=base, column=2, value=f'{n} vales').font = Font(bold=True)
        cel = ws.cell(row=base, column=5, value=suma)
        cel.number_format = MONEY_FMT
        cel.font = Font(bold=True)
        base += 1

    # Anchos
    for col, w in zip(range(1, len(COLUMNAS) + 1),
                      [12, 30, 10, 30, 12, 16, 18, 12, 14, 45]):
        ws.column_dimensions[get_column_letter(col)].width = w

    wb.save(ruta)
    return ruta
```

- [ ] **Step 2: Verificar que genera un Excel con filas de ejemplo**

Run:
```bash
cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python -c "
import cruce_comidas_salida as c
from datetime import date, datetime
filas=[{'fecha':date(2026,7,8),'nombre_vale':'JUAN','codigo':'1218','empleado_checador':'JUAN PEREZ','monto':100.0,'estado_vale':'aprobado','ultima_salida_str':'2026-07-08 18:01','cumple_str':'SI','estado':'CUMPLE','nota':''}]
p=c.generar_excel(filas,'2026-07-01','2026-07-08','C:/Users/USUARIO/Downloads/_test_comidas.xlsx')
import openpyxl; wb=openpyxl.load_workbook(p); ws=wb.active
print('titulo', ws['A1'].value); print('header col1', ws.cell(row=3,column=1).value); print('fila', ws.cell(row=4,column=9).value)
"
```
Expected: imprime el título, `Fecha` como header y `CUMPLE` en la fila de datos.

- [ ] **Step 3: Commit**

```bash
git add cruce_comidas_salida.py
git commit -m "feat(comidas): generacion del Excel con colores y totales"
```

---

### Task 11: `main` — orquestación y argumentos

**Files:**
- Modify: `cruce_comidas_salida.py`

- [ ] **Step 1: Implementar `main`**

```python
# ===== Main =====
def main():
    fi_str = sys.argv[1] if len(sys.argv) > 1 else FECHA_INICIO
    ff_str = sys.argv[2] if len(sys.argv) > 2 else FECHA_FIN
    fi = parse_fecha_vale(fi_str)
    ff = parse_fecha_vale(ff_str)
    if fi is None or ff is None or fi > ff:
        print(f'Rango invalido: {fi_str} .. {ff_str}', file=sys.stderr)
        sys.exit(1)

    print(f'Rango: {fi} a {ff}')
    print('Cargando catalogos...')
    checador_by_code, checador_by_name = cargar_checador()
    rnd_by_name = cargar_rnd_empleados()
    print(f'  checador: {len(checador_by_code)} codigos | rnd: {len(rnd_by_name)} nombres')

    print('Cargando vales de comida...')
    vales = cargar_vales_comida(fi, ff)
    print(f'  {len(vales)} vales de comida en el rango')

    print('Cargando salidas...')
    registros = cargar_registros_salida(fi, ff)
    salidas = indexar_salidas(registros)
    print(f'  {len(registros)} checadas de salida | {len(salidas)} empleado-dia')

    filas = construir_filas(vales, rnd_by_name, checador_by_code,
                            checador_by_name, salidas)

    n_cumple = sum(1 for f in filas if f['estado'] == 'CUMPLE')
    n_no = sum(1 for f in filas if f['estado'] == 'NO_CUMPLE')
    n_rev = sum(1 for f in filas if f['estado'] == 'REVISAR')
    print(f'  Cumplen: {n_cumple} | No cumplen: {n_no} | Revisar: {n_rev}')

    ruta = OUTPUT.format(inicio=fi, fin=ff)
    generar_excel(filas, str(fi), str(ff), ruta)
    print(f'Excel generado: {ruta}')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Ejecución end-to-end real**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python cruce_comidas_salida.py 2026-07-01 2026-07-08`
Expected: imprime los conteos y `Excel generado: C:/Users/USUARIO/Downloads/cruce_comidas_2026-07-01_2026-07-08.xlsx`. El nº de "Cumplen" debe ser plausible (decenas), "Revisar" un porcentaje pequeño.

- [ ] **Step 3: Verificar el Excel a mano**

Abrir el archivo generado y confirmar: hay filas verdes (cumple), rojas (no cumple) y amarillas (revisar); montos con formato dinero; totales al final. Verificar 2-3 empleados conocidos (p. ej. los que trabajaron corrido el 8-jul: TANNIA, MAYRA) contra su hora de salida.

- [ ] **Step 4: Commit**

```bash
git add cruce_comidas_salida.py
git commit -m "feat(comidas): main con argumentos de rango y orquestacion end-to-end"
```

---

### Task 12: Verificación final con la skill `verify`

**Files:** (ninguno nuevo)

- [ ] **Step 1: Correr todas las pruebas unitarias**

Run: `cd "C:/Users/USUARIO/Desktop/V2 checador-system ADMIN" && python test_cruce_comidas.py`
Expected: todas las líneas `OK ...` y `TODOS OK`.

- [ ] **Step 2: Contrastar contra la consulta SQL de referencia**

Correr en Supabase (MCP) la misma lógica en SQL para una fecha y comparar el conteo de "Cumplen" con el del Excel. Ejemplo para 2026-07-08:

```sql
WITH vales AS (
  SELECT DISTINCT upper(trim(nombre_beneficiario)) AS benef
  FROM rnd_reembolsos
  WHERE upper(concepto) LIKE '%COMIDA%' AND fecha = '2026-07-08'
),
sal AS (
  SELECT empleado_id, max(fecha_hora) AS ult
  FROM registros
  WHERE tipo_registro='SALIDA' AND fecha_hora::date='2026-07-08'
  GROUP BY empleado_id
)
SELECT count(*) AS cumplen_aprox
FROM vales v
JOIN rnd_empleados re ON upper(trim(re.nombre)) = v.benef
JOIN empleados e ON e.codigo_empleado = re.codigo
JOIN sal s ON s.empleado_id = e.id
WHERE s.ult::time >= '17:30';
```

Expected: el número debe estar en el mismo orden de magnitud que "Cumplen" del script para ese día (el script cubre más por los fallbacks, así que puede ser ligeramente mayor). Si difieren mucho, investigar antes de dar por terminado.

- [ ] **Step 3: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "test(comidas): verificacion final del cruce"
```

---

## Notas de implementación

- **No** se instalan extensiones Postgres; todo el matching es en Python.
- El script **solo lee** de Supabase. No escribe nada de vuelta.
- Si el volumen de `registros` del rango es grande, la paginación de `supabase_get_all`
  lo maneja (chunks de 1000).
- El umbral `HORA_MINIMA_SALIDA = time(17, 30)` es la única perilla de la regla; cambiarlo
  ahí ajusta todo el reporte.
