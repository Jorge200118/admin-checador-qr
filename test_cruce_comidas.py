import cruce_comidas_salida as c
from datetime import date, datetime


def test_normalizar_nombre():
    assert c.norm_nombre('  José  Pérez ') == 'JOSE PEREZ'
    assert c.norm_nombre('JASIVE ANAIS TRASVIÑA OSUNA') == 'JASIVE ANAIS TRASVINA OSUNA'
    assert c.norm_nombre('Luis   Roberto Lopez Galaviz') == 'LUIS ROBERTO LOPEZ GALAVIZ'
    assert c.norm_nombre(None) == ''
    print('OK test_normalizar_nombre')


def test_fecha_vale():
    assert c.parse_fecha_vale('2026-07-08') == date(2026, 7, 8)
    assert c.parse_fecha_vale('0026-06-09') == date(2026, 6, 9)  # año corrupto
    assert c.parse_fecha_vale('bad') is None
    assert c.parse_fecha_vale(None) is None
    print('OK test_fecha_vale')


def test_identificar_empleado():
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


def test_clasificar():
    assert c.clasificar(datetime(2026, 7, 8, 18, 1))['estado'] == 'CUMPLE'
    assert c.clasificar(datetime(2026, 7, 8, 17, 30))['estado'] == 'CUMPLE'   # limite inclusivo
    assert c.clasificar(datetime(2026, 7, 8, 16, 40))['estado'] == 'NO_CUMPLE'
    r = c.clasificar(None)
    assert r['estado'] == 'NO_CUMPLE' and 'Sin checada' in r['nota']
    print('OK test_clasificar')


def test_ultima_salida():
    regs = [
        {'empleado_id': 10, 'tipo_registro': 'ENTRADA', 'fecha_hora': '2026-07-08 08:03:00'},
        {'empleado_id': 10, 'tipo_registro': 'SALIDA',  'fecha_hora': '2026-07-08 13:04:00'},
        {'empleado_id': 10, 'tipo_registro': 'SALIDA',  'fecha_hora': '2026-07-08 18:01:00'},
        {'empleado_id': 10, 'tipo_registro': 'SALIDA',  'fecha_hora': '2026-07-07 17:00:00'},
    ]
    idx = c.indexar_salidas(regs)
    assert idx[(10, date(2026, 7, 8))].hour == 18
    assert idx[(10, date(2026, 7, 7))].hour == 17
    assert (10, date(2026, 7, 6)) not in idx
    print('OK test_ultima_salida')


def test_construir_filas():
    emp = {'id': 10, 'codigo_empleado': '1218', 'nombre': 'JASIVE ANAIS',
           'apellido': 'TRASVINA OSUNA', 'horario_id': 2}
    vales = [
        {'nombre_beneficiario': 'JASIVE ANAIS TRASVIÑA OSUNA', 'monto': '100.00',
         'estado': 'aprobado', '_fecha': date(2026, 7, 8)},
        {'nombre_beneficiario': 'PROVEEDOR EXTERNO', 'monto': '500.00',
         'estado': 'aprobado', '_fecha': date(2026, 7, 8)},
        # duplicado del mismo empleado el mismo dia -> anomalia
        {'nombre_beneficiario': 'JASIVE ANAIS TRASVIÑA OSUNA', 'monto': '80.00',
         'estado': 'aprobado', '_fecha': date(2026, 7, 8)},
    ]
    rnd_by_name = {'JASIVE ANAIS TRASVINA OSUNA': '1218'}
    checador_by_code = {'1218': emp}
    checador_by_name = {'JASIVE ANAIS TRASVINA OSUNA': [emp]}
    salidas = {(10, date(2026, 7, 8)): datetime(2026, 7, 8, 18, 1)}

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


if __name__ == '__main__':
    test_normalizar_nombre()
    test_fecha_vale()
    test_identificar_empleado()
    test_clasificar()
    test_ultima_salida()
    test_construir_filas()
    print('TODOS OK')
