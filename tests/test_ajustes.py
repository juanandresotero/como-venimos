import unittest

from robot import almacen


class TestAjustes(unittest.TestCase):
    def setUp(self):
        self.a = almacen.leer_json("ajustes.json", None)

    def test_el_archivo_existe(self):
        self.assertIsNotNone(self.a, "falta datos/ajustes.json")

    def test_la_categoria_vigente_es_rap_al_45_con_fee_70(self):
        vigente = [c for c in self.a["categorias"] if c["hasta"] is None]
        self.assertEqual(len(vigente), 1, "tiene que haber exactamente una categoria vigente")
        self.assertEqual(vigente[0]["categoria"], "RAP")
        self.assertEqual(vigente[0]["split_pct"], 0.45)
        self.assertEqual(vigente[0]["fee_mensual_usd"], 70)

    def test_las_comisiones_por_defecto(self):
        d = self.a["defaults_comision"]
        self.assertEqual(d["venta"]["1"], 0.03)
        self.assertEqual(d["venta"]["2"], 0.06)
        self.assertEqual(d["alquiler"]["1"], 1.0)
        self.assertEqual(d["alquiler"]["2"], 2.0)

    def test_la_regla_de_martin_va_aparte_de_la_categoria(self):
        # Martin no escala con RAP/ALTO/PURO: es un arreglo fijo.
        self.assertEqual(self.a["regla_martin"], {"facturacion": 0.50, "ganancia": 0.35})

    def test_los_niveles_remax(self):
        n = self.a["niveles_remax"]
        self.assertEqual(n["Rokie"], 30000)
        self.assertEqual(n["Diamond"], 400000)

    def test_las_probabilidades_de_cierre(self):
        p = self.a["probabilidades_cierre"]
        self.assertEqual(p["reservada"], 0.90)
        self.assertEqual(p["en_negociacion"], 0.60)
        self.assertEqual(p["publicada"], 0.25)

    def test_los_objetivos_personales(self):
        self.assertEqual(self.a["objetivo_personal"]["2026"], 65000)


if __name__ == "__main__":
    unittest.main()
