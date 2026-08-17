import json
import pathlib
import unittest

from robot import modelo, procesar

FIXTURE = pathlib.Path(__file__).resolve().parent / "fixtures" / "respuesta_api.json"


class TestConDatosReales(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(FIXTURE, encoding="utf-8") as archivo:
            crudo = json.load(archivo)
        cls.listings = crudo["data"]["data"]

    def normalizadas(self):
        return [modelo.normalizar(x) for x in self.listings]

    def test_todas_las_propiedades_se_traducen_sin_romperse(self):
        propiedades = self.normalizadas()
        self.assertGreater(len(propiedades), 0)
        for p in propiedades:
            self.assertIsNotNone(p["entity_id"], f"sin entity_id: {p['titulo']}")
            self.assertIsNotNone(p["precio"], f"sin precio: {p['titulo']}")
            self.assertIn(p["operacion"], ("venta", "alquiler"))
            self.assertIn(p["estado"], ("publicada", "en_negociacion", "reservada"))

    def test_los_entity_id_son_unicos(self):
        ids = [p["entity_id"] for p in self.normalizadas()]
        self.assertEqual(len(ids), len(set(ids)))

    def test_la_primera_corrida_da_de_alta_todo_como_carga_inicial(self):
        propiedades = self.normalizadas()
        cartera, eventos = procesar.procesar({}, propiedades, "2026-08-18")
        self.assertEqual(len(cartera), len(propiedades))
        iniciales = [e for e in eventos if e["tipo"] == "carga_inicial"]
        self.assertEqual(len(iniciales), len(propiedades))

    def test_correr_dos_veces_el_mismo_dia_no_genera_novedades_nuevas(self):
        propiedades = self.normalizadas()
        cartera, _ = procesar.procesar({}, propiedades, "2026-08-18")
        _, eventos = procesar.procesar(cartera, propiedades, "2026-08-18")
        self.assertEqual(eventos, [])

    def test_detecta_el_duplicado_de_gutenberg(self):
        # Verificado a mano el 2026-08-17: la propiedad de Gutenberg 6100 esta publicada
        # dos veces, una como casa y otra como local, ambas a 490.000.
        propiedades = self.normalizadas()
        _, eventos = procesar.procesar({}, propiedades, "2026-08-18")
        duplicados = [e for e in eventos if e["tipo"] == "posible_duplicado"]
        direcciones = {e["direccion"] for e in duplicados}
        self.assertIn("Gutenberg 6100", direcciones)

    def test_todo_lo_guardado_se_puede_serializar_a_json(self):
        propiedades = self.normalizadas()
        cartera, eventos = procesar.procesar({}, propiedades, "2026-08-18")
        json.dumps(cartera, ensure_ascii=False)
        json.dumps(eventos, ensure_ascii=False)


if __name__ == "__main__":
    unittest.main()
