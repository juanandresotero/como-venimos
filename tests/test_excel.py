import unittest

from negocios import excel


class TestANumero(unittest.TestCase):
    def test_un_numero_queda_igual(self):
        self.assertEqual(excel.a_numero(140000), 140000)
        self.assertEqual(excel.a_numero(0.03), 0.03)

    def test_un_porcentaje_escrito_como_texto(self):
        # En el Excel hay 37 celdas asi en la columna de % Comision.
        self.assertAlmostEqual(excel.a_numero("150.40%"), 1.504)
        self.assertAlmostEqual(excel.a_numero("4.50%"), 0.045)
        self.assertAlmostEqual(excel.a_numero("50.00%"), 0.5)

    def test_un_numero_escrito_como_texto(self):
        self.assertAlmostEqual(excel.a_numero("2772.96"), 2772.96)
        self.assertAlmostEqual(excel.a_numero("1039.5"), 1039.5)

    def test_texto_con_separador_de_miles(self):
        self.assertAlmostEqual(excel.a_numero("1,200"), 1200.0)

    def test_vacio_o_basura_da_none(self):
        self.assertIsNone(excel.a_numero(None))
        self.assertIsNone(excel.a_numero(""))
        self.assertIsNone(excel.a_numero("   "))
        self.assertIsNone(excel.a_numero("no es un numero"))


class TestAFecha(unittest.TestCase):
    def test_un_datetime_se_vuelve_texto_iso(self):
        import datetime
        self.assertEqual(excel.a_fecha(datetime.datetime(2022, 8, 10)), "2022-08-10")
        self.assertEqual(excel.a_fecha(datetime.date(2022, 8, 10)), "2022-08-10")

    def test_vacio_da_none(self):
        self.assertIsNone(excel.a_fecha(None))
        self.assertIsNone(excel.a_fecha(""))


# El Excel es un archivo de trabajo del usuario, no parte de la app: esta en .gitignore,
# asi que en GitHub no existe. Lo que SI se versiona y se verifica en CI es el resultado
# de la importacion (datos/negocios.json), en tests/test_importacion_real.py.
@unittest.skipUnless(
    excel.ARCHIVO.exists(),
    "negocios.xlsx no esta (es local, no se versiona) — la importacion se verifica "
    "igual en test_importacion_real.py",
)
class TestLeer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.filas = excel.leer()

    def test_trae_las_85_filas(self):
        self.assertEqual(len(self.filas), 85)

    def test_cada_fila_sabe_de_que_renglon_del_excel_salio(self):
        # Para poder decirle al usuario "fila 37" y que la encuentre en su planilla.
        self.assertEqual(self.filas[0]["fila_excel"], 2)
        self.assertEqual(self.filas[-1]["fila_excel"], 86)

    def test_los_porcentajes_quedaron_todos_como_numero(self):
        for f in self.filas:
            for campo in ("pct_comision", "pct_agente"):
                self.assertNotIsInstance(f[campo], str, f"fila {f['fila_excel']}: {campo} quedo texto")

    def test_los_montos_quedaron_todos_como_numero(self):
        for f in self.filas:
            for campo in ("precio", "facturado", "importe"):
                self.assertNotIsInstance(f[campo], str, f"fila {f['fila_excel']}: {campo} quedo texto")

    def test_las_fechas_quedaron_como_texto_iso(self):
        con_fecha = [f for f in self.filas if f["fecha_fin"]]
        self.assertGreater(len(con_fecha), 80)
        for f in con_fecha:
            self.assertRegex(f["fecha_fin"], r"^\d{4}-\d{2}-\d{2}$")

    def test_las_operaciones_son_venta_o_alquiler(self):
        self.assertEqual({f["operacion"] for f in self.filas}, {"Venta", "Alquiler"})

    def test_hay_46_alquileres_y_39_ventas(self):
        ops = [f["operacion"] for f in self.filas]
        self.assertEqual(ops.count("Alquiler"), 46)
        self.assertEqual(ops.count("Venta"), 39)


if __name__ == "__main__":
    unittest.main()
