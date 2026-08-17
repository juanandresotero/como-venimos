import unittest

from negocios import motor

AJUSTES = {
    "categorias": [
        {"categoria": "RAP", "split_pct": 0.45, "fee_mensual_usd": 70,
         "desde": "2026-01-01", "hasta": None},
    ],
    "defaults_comision": {
        "venta": {"1": 0.03, "2": 0.06},
        "alquiler": {"1": 1.0, "2": 2.0},
    },
    "regla_martin": {"facturacion": 0.5, "ganancia": 0.35},
    "pct_suplencia": 0.125,
    "pct_referido_saliente": 0.25,
    "pct_referido_entrante_otro": 0.75,
}

AJUSTES_CON_HISTORIA = {
    "categorias": [
        {"categoria": "RAP", "split_pct": 0.45, "fee_mensual_usd": 70,
         "desde": "2026-01-01", "hasta": "2026-05-31"},
        {"categoria": "ALTO", "split_pct": 0.60, "fee_mensual_usd": 425,
         "desde": "2026-06-01", "hasta": None},
    ],
    "regla_martin": {"facturacion": 0.5, "ganancia": 0.35},
    "pct_suplencia": 0.125,
    "pct_referido_saliente": 0.25,
    "pct_referido_entrante_otro": 0.75,
}


class TestPctPorDefecto(unittest.TestCase):
    def test_venta_una_punta_es_3_por_ciento(self):
        self.assertEqual(motor.pct_por_defecto("venta", 1, AJUSTES), 0.03)

    def test_venta_dos_puntas_es_6_por_ciento(self):
        self.assertEqual(motor.pct_por_defecto("venta", 2, AJUSTES), 0.06)

    def test_alquiler_una_punta_es_un_mes(self):
        self.assertEqual(motor.pct_por_defecto("alquiler", 1, AJUSTES), 1.0)

    def test_alquiler_dos_puntas_son_dos_meses(self):
        self.assertEqual(motor.pct_por_defecto("alquiler", 2, AJUSTES), 2.0)

    def test_la_renovacion_usa_la_tabla_de_alquiler(self):
        self.assertEqual(motor.pct_por_defecto("renovacion_alquiler", 1, AJUSTES), 1.0)

    def test_cero_puntas_usa_la_tabla_de_una_punta(self):
        # Un referido saliente no tiene punta propia, pero la comision del negocio existe.
        self.assertEqual(motor.pct_por_defecto("venta", 0, AJUSTES), 0.03)


class TestBase(unittest.TestCase):
    def test_venta_de_100000_al_3_por_ciento(self):
        self.assertEqual(motor.base(100000.0, 0.03), 3000.0)

    def test_venta_de_100000_al_6_por_ciento(self):
        self.assertEqual(motor.base(100000.0, 0.06), 6000.0)

    def test_alquiler_de_333_a_dos_meses(self):
        self.assertEqual(motor.base(333.0, 2.0), 666.0)

    def test_sin_precio_da_cero(self):
        self.assertEqual(motor.base(None, 0.03), 0.0)

    def test_sin_porcentaje_da_cero(self):
        self.assertEqual(motor.base(100000.0, None), 0.0)


class TestSplitVigente(unittest.TestCase):
    def test_devuelve_la_categoria_de_esa_fecha(self):
        self.assertEqual(motor.split_vigente("2026-03-15", AJUSTES)[0], "RAP")
        self.assertEqual(motor.split_vigente("2026-03-15", AJUSTES)[1], 0.45)

    def test_con_historia_toma_la_que_corresponde_a_cada_fecha(self):
        # Si cambia de categoria en junio, los negocios de marzo se siguen calculando al 45%.
        # Sin esto, cambiar de categoria deformaria todo el historico de golpe.
        self.assertEqual(motor.split_vigente("2026-03-15", AJUSTES_CON_HISTORIA), ("RAP", 0.45))
        self.assertEqual(motor.split_vigente("2026-08-15", AJUSTES_CON_HISTORIA), ("ALTO", 0.60))

    def test_el_ultimo_dia_del_periodo_todavia_cuenta(self):
        self.assertEqual(motor.split_vigente("2026-05-31", AJUSTES_CON_HISTORIA), ("RAP", 0.45))

    def test_el_primer_dia_del_periodo_nuevo_ya_cuenta(self):
        self.assertEqual(motor.split_vigente("2026-06-01", AJUSTES_CON_HISTORIA), ("ALTO", 0.60))

    def test_una_fecha_anterior_a_toda_la_historia_no_tiene_categoria(self):
        # Los negocios de 2023 se importan con sus numeros tal cual, no se recalculan.
        self.assertEqual(motor.split_vigente("2023-05-01", AJUSTES), (None, None))

    def test_sin_fecha_no_tiene_categoria(self):
        self.assertEqual(motor.split_vigente(None, AJUSTES), (None, None))


class TestCalcular(unittest.TestCase):
    """Verificado contra la tabla que dio el usuario: propiedad de 100.000, comision 3%.

    BASE 1 punta = 3.000 | BASE 2 puntas = 6.000
    """

    def calc(self, regimen, base_valor, fecha="2026-03-15"):
        return motor.calcular(regimen, base_valor, fecha, AJUSTES)

    def test_captacion_mia_una_punta(self):
        self.assertEqual(self.calc("captacion_mia", 3000.0), (3000.0, 1350.0))

    def test_captacion_mia_dos_puntas(self):
        self.assertEqual(self.calc("captacion_mia", 6000.0), (6000.0, 2700.0))

    def test_referida_de_martin_una_punta(self):
        # Martin se lleva la mitad de la facturacion, y a Juan le queda el 35% del total.
        self.assertEqual(self.calc("ref_martin", 3000.0), (1500.0, 1050.0))

    def test_referida_de_martin_dos_puntas(self):
        self.assertEqual(self.calc("ref_martin", 6000.0), (3000.0, 2100.0))

    def test_referida_de_otro_colega_una_punta(self):
        # Factura el total, paga 25% de referido, y sobre lo que queda va su 45%.
        self.assertEqual(self.calc("ref_otro_colega", 3000.0), (3000.0, 1012.5))

    def test_referida_de_otro_colega_dos_puntas(self):
        self.assertEqual(self.calc("ref_otro_colega", 6000.0), (6000.0, 2025.0))

    def test_yo_referi_una_punta(self):
        self.assertEqual(self.calc("yo_referi", 3000.0), (750.0, 337.5))

    def test_yo_referi_dos_puntas(self):
        self.assertEqual(self.calc("yo_referi", 6000.0), (1500.0, 675.0))

    def test_suplencia_no_factura_pero_deja_ganancia(self):
        # Cubrir una visita a un colega no pasa por RE/MAX: es 12,5% directo al bolsillo.
        self.assertEqual(self.calc("suplencia", 6000.0), (0.0, 750.0))

    def test_la_suplencia_no_se_reparte_con_la_oficina(self):
        _, ganancia = self.calc("suplencia", 6000.0)
        self.assertEqual(ganancia, 6000.0 * 0.125)

    def test_martin_no_escala_con_la_categoria(self):
        # Con ALTO (60%) los demas regimenes suben, pero el arreglo con Martin es fijo.
        alto = motor.calcular("ref_martin", 3000.0, "2026-08-15", AJUSTES_CON_HISTORIA)
        self.assertEqual(alto, (1500.0, 1050.0))

    def test_los_demas_regimenes_si_escalan_con_la_categoria(self):
        alto = motor.calcular("captacion_mia", 3000.0, "2026-08-15", AJUSTES_CON_HISTORIA)
        self.assertEqual(alto, (3000.0, 1800.0))    # 60% de 3000

    def test_sin_categoria_vigente_no_calcula_ganancia(self):
        # Un negocio de 2023 no se recalcula: sus numeros vienen del Excel.
        self.assertEqual(motor.calcular("captacion_mia", 3000.0, "2023-05-01", AJUSTES),
                         (3000.0, None))

    def test_un_regimen_desconocido_avisa(self):
        with self.assertRaises(ValueError):
            motor.calcular("cualquier_cosa", 3000.0, "2026-03-15", AJUSTES)


if __name__ == "__main__":
    unittest.main()
